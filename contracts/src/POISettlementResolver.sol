// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {POIResolverBase} from "./POIResolverBase.sol";
import {POICodec} from "./POICodec.sol";

/// @title POISettlementResolver — `poi.settlement.v1` (POI_TechSpec_v3.md §5.3, §6.4, F6)
/// @notice C5. I7~I13, I16, I17.
///
/// 두 가지가 핵심이다.
///
/// 1. **온체인 판정 강제**(B6, I17). v2.1은 "관측값"과 "결과 판정"을 둘 다 발행자 말대로 믿었다.
///    v3는 관측값만 받고 `result`는 컨트랙트가 `_eval`로 다시 계산해 대조한다. 그래서 이의 제기의
///    의미가 "계산이 틀렸다"가 아니라 "관측값 또는 출처가 틀렸다"로 좁아진다.
///
/// 2. **`activeHead`/`lastHead` 분리**(B1). 단일 head면 revoke 직후 정정이 데드락에 빠진다 —
///    head가 0이 되어 `supersedes=S1`은 "head가 아니다"로 막히고, `supersedes=0`은 통과하지만
///    정정 이력이 끊긴다. 두 포인터를 나누면 철회 후에도 체인이 이어진다.
contract POISettlementResolver is POIResolverBase {
    uint8 internal constant RESULT_INDETERMINATE = 2;

    /// @notice 결정 attestation을 검증하려면 결정 스키마 UID가 필요하다 (§5.2).
    bytes32 public decisionSchemaUID;

    /// @notice 결정별 현재 유효한 정산. 철회되면 0으로 돌아간다.
    mapping(bytes32 decisionUID => bytes32 settlementUID) public activeHead;

    /// @notice 결정별 마지막 head. **철회돼도 보존된다** — 정정 체인을 잇는 앵커다.
    mapping(bytes32 decisionUID => bytes32 settlementUID) public lastHead;

    /// @notice 철회 횟수. 프론트의 「정산 철회 이력 있음」 표시(F8)가 이 값을 쓴다.
    mapping(bytes32 decisionUID => uint32 count) public revokeCount;

    error SourceRequired();
    error VerifierVersionRequired();
    error SourceTooLong();
    error VerifierVersionTooLong();

    uint256 private constant MAX_SOURCE = 64;
    uint256 private constant MAX_VERIFIER_VERSION = 32;

    error MustBeRevocable();
    error MalformedPayload();
    error RefUIDMismatch();
    error ResultOutOfRange();
    error DecisionNotFound();
    error DecisionWrongSchema();
    error NotDecisionOwner();
    error DecisionRevoked();
    error DecisionHasNoOutcome();
    error WindowNotEnded();
    error ObservedAtMustBeWindowEnd();
    error MustBeIndeterminate();
    error IndeterminateHasValue();
    error ResultMismatch();
    error MustSupersede();
    error PriorStillActive();
    error SupersedesNotLastHead();
    error SupersedesWrongSchema();
    error SupersedesNotRevoked();

    constructor(IEAS eas) POIResolverBase(eas) {}

    /// @dev 필요한 UID를 전부 받는 단일 진입점 — 부분 초기화가 불가능하도록 (§6.2).
    function initialize(bytes32 settlementSchemaUID, bytes32 decisionSchema) external {
        _requireNonZeroUID(decisionSchema);
        decisionSchemaUID = decisionSchema;
        _initializeBase(settlementSchemaUID);
    }

    function onAttest(Attestation calldata a, uint256) internal override ready returns (bool) {
        _guard(a, schemaUID);

        // I11 — 정산은 정정할 수 있어야 한다. 비철회로 발행되면 오류를 영구히 못 고친다.
        if (!a.revocable) revert MustBeRevocable();

        POICodec.SettlementData memory s = POICodec.decodeSettlement(a.data);
        _requireCanonicalPayload(a.data, s);

        if (a.refUID != s.decisionUID) revert RefUIDMismatch(); // I12
        if (s.result > RESULT_INDETERMINATE) revert ResultOutOfRange();

        POICodec.DecisionData memory d = _checkDecision(s.decisionUID, a);
        _checkResult(s, d);
        _checkChain(s);

        activeHead[s.decisionUID] = a.uid;
        lastHead[s.decisionUID] = a.uid;
        return true;
    }

    /// @dev I10 — 자기 결정만 정산할 수 있다. 이것이 없으면 타인이 남의 결정에 head를 꽂는다.
    ///      I7 — 구간이 끝나기 전의 정산은 관측이 아니라 예측이다.
    function _checkDecision(bytes32 decisionUID, Attestation calldata a)
        private
        view
        returns (POICodec.DecisionData memory d)
    {
        Attestation memory dA = _eas.getAttestation(decisionUID);
        if (dA.uid == 0) revert DecisionNotFound();
        if (dA.schema != decisionSchemaUID) revert DecisionWrongSchema();
        if (dA.attester != a.attester) revert NotDecisionOwner(); // I10
        if (dA.revocationTime != 0) revert DecisionRevoked();

        d = POICodec.decodeDecision(dA.data);
        if (!d.hasExpectedOutcome) revert DecisionHasNoOutcome();
        if (a.time < d.windowEnd) revert WindowNotEnded(); // I7
    }

    /// @dev I8 · I16 · I17. MVP 지표는 전부 **구간 종료 시점** 평가다(B7) — `observedAt`이
    ///      구간 안 아무 시점이나 될 수 있으면 발행자가 유리한 순간을 골라 관측할 수 있다.
    function _checkResult(POICodec.SettlementData memory s, POICodec.DecisionData memory d) private pure {
        if (s.observedAt != d.windowEnd) revert ObservedAtMustBeWindowEnd(); // I8

        // 출처와 검증기 버전이 없으면 제3자가 같은 절차를 밟을 수 없다 —
        // 재현 가능성이 이 시스템의 전제다. **관측 실패(INDETERMINATE)도 마찬가지다** —
        // "어디를 어떤 절차로 조회했는데 값이 없었다"가 남아야 검증이 가능하다.
        if (bytes(s.source).length == 0) revert SourceRequired();
        if (bytes(s.verifierVersion).length == 0) revert VerifierVersionRequired();
        if (bytes(s.source).length > MAX_SOURCE) revert SourceTooLong();
        if (bytes(s.verifierVersion).length > MAX_VERIFIER_VERSION) revert VerifierVersionTooLong();

        if (!s.hasObservedValue) {
            if (s.result != RESULT_INDETERMINATE) revert MustBeIndeterminate(); // I16
            return;
        }

        // ★ B6 — 판정 산술을 온체인이 강제한다. 발행자에게 남는 자유는 관측값뿐이다.
        if (s.result == RESULT_INDETERMINATE) revert IndeterminateHasValue();
        uint8 expect = _eval(d.outcomeOp, s.observedValue, d.outcomeThreshold) ? 0 : 1;
        if (s.result != expect) revert ResultMismatch(); // I17
    }

    /// @dev I9 · I13 — 최초 발행과 정정을 가르는 상태 머신.
    ///      `lastHead`가 살아 있으므로 "한 번이라도 정산했으면 이후는 반드시 정정"이 성립한다.
    function _checkChain(POICodec.SettlementData memory s) private view {
        if (s.supersedes == 0) {
            if (lastHead[s.decisionUID] != 0) revert MustSupersede(); // I13
            return;
        }

        if (activeHead[s.decisionUID] != 0) revert PriorStillActive(); // I9
        if (lastHead[s.decisionUID] != s.supersedes) revert SupersedesNotLastHead();

        Attestation memory prev = _eas.getAttestation(s.supersedes);
        if (prev.schema != schemaUID) revert SupersedesWrongSchema();
        if (prev.revocationTime == 0) revert SupersedesNotRevoked();
    }

    /// @dev §5.3 `op` 6종. 결정의 `outcomeOp`는 C4에서 이미 0~5로 제한돼 있다.
    function _eval(uint8 op, int128 v, int128 t) internal pure returns (bool) {
        if (op == 0) return v > t;
        if (op == 1) return v >= t;
        if (op == 2) return v < t;
        if (op == 3) return v <= t;
        if (op == 4) return v == t;
        return v != t;
    }

    /// @dev EAS는 `data`를 스키마에 대해 검증하지 않는다. 잉여 워드나 비정규 offset을 붙여도
    ///      `abi.decode`는 조용히 무시하므로 불변식은 전부 통과하는데 온체인에는 비정규
    ///      payload가 영구히 남는다(C4에서 같은 결함이 지적됐다). 결정과 달리 정산에는
    ///      가변 문자열이 둘 있어 길이만으로는 offset 조작을 못 막는다. 그래서 디코딩 결과를
    ///      다시 인코딩해 원본과 바이트 단위로 대조한다 — 정규 인코딩은 유일하다.
    function _requireCanonicalPayload(bytes calldata data, POICodec.SettlementData memory s) private pure {
        bytes memory canonical = abi.encode(
            s.decisionUID,
            s.result,
            s.hasObservedValue,
            s.observedValue,
            s.source,
            s.observedAt,
            s.verifierVersion,
            s.supersedes
        );
        if (keccak256(data) != keccak256(canonical)) revert MalformedPayload();
    }

    /// @dev 철회는 `activeHead`만 비운다. `lastHead`를 보존하는 것이 B1 해법의 전부다.
    ///      자기가 head가 아닐 때(이미 정정된 옛 정산의 뒤늦은 철회)는 아무것도 하지 않는다 —
    ///      그렇지 않으면 현재 head가 지워진다.
    function onRevoke(Attestation calldata a, uint256) internal override returns (bool) {
        POICodec.SettlementData memory s = POICodec.decodeSettlement(a.data);
        if (activeHead[s.decisionUID] == a.uid) {
            activeHead[s.decisionUID] = 0;
            revokeCount[s.decisionUID] += 1;
        }
        return true;
    }
}
