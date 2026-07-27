// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {POIResolverBase} from "./POIResolverBase.sol";
import {POIMetricRegistry} from "./POIMetricRegistry.sol";
import {POICodec} from "./POICodec.sol";

/// @title POIDecisionResolver — `poi.decision.v1` (POI_TechSpec_v3.md §5.2, §6.3, F4)
/// @notice C4. I1~I6, I12, I14.
///
/// 이 리졸버가 강제하는 것의 핵심은 **관측 구간이 커밋 시점보다 미래**라는 것이다(I4).
/// 이것이 무너지면 "결과를 알기 전에 결정했다"는 주장 전체가 무너진다 — 이미 지나간
/// 구간을 선언하면 결과를 보고 나서 결정을 쓰는 것과 구별되지 않는다.
contract POIDecisionResolver is POIMetricRegistry {
    uint256 internal constant MAX_PARENTS = 8;
    uint64 internal constant MAX_START_DELAY = 30 days;
    uint64 internal constant MAX_WINDOW = 730 days;
    uint32 internal constant MIN_GRACE = 1 hours; // B11 — graceDays에서 전환
    uint32 internal constant MAX_GRACE = 30 days;
    uint8 internal constant MAX_OP = 5;

    /// @dev `poi.decision.v1` 평면 튜플의 정규 길이 = 헤드 14워드 + parents 길이워드 + 원소들.
    ///      EAS는 data를 스키마에 대해 검증하지 않으므로, 뒤에 잉여 워드를 붙여도
    ///      `abi.decode`는 조용히 무시한다. 그대로 두면 불변식은 전부 통과하는데
    ///      온체인에는 비정규 payload가 영구히 남고, 엄격한 클라이언트는 그것을 거부한다.
    uint256 internal constant DECISION_HEAD_BYTES = 14 * 32;
    uint256 internal constant PARENTS_LENGTH_BYTES = 32;

    /// @notice 승격 원본 노트를 검증하기 위해 필요하다 (§5.1).
    bytes32 public noteSchemaUID;

    error MustBeIrrevocable();
    error MalformedPayload();
    error TooManyParents();
    error RefUIDMismatch();
    error ParentNotFound();
    error ParentWrongSchema();
    error ParentNotSameActor();
    error ParentNotEarlier();
    error ParentRevoked();
    error NoteNotFound();
    error NoteWrongSchema();
    error NoteNotSameActor();
    error NoteNotEarlier();
    error BadVerifiedUID();
    error MetricNotAllowed();
    error OpOutOfRange();
    error WindowInPast();
    error WindowStartTooFar();
    error WindowInvalid();
    error WindowTooLong();
    error GraceOutOfRange();
    error OutcomeFieldsMustBeZero();

    constructor(IEAS eas) POIResolverBase(eas) {}

    /// @dev 필요한 UID를 전부 받는 단일 진입점 — 부분 초기화가 불가능하도록.
    function initialize(bytes32 decisionSchemaUID, bytes32 noteSchema) external {
        _requireNonZeroUID(noteSchema);
        noteSchemaUID = noteSchema;
        _initializeBase(decisionSchemaUID);
    }

    function onAttest(Attestation calldata a, uint256) internal view override ready returns (bool) {
        _guard(a, schemaUID);

        // 결정은 영구 기록이다. 스키마 레벨(§5.2 revocable:false)과 함께 2단계로 막는다 (§1.2).
        if (a.revocable) revert MustBeIrrevocable();

        POICodec.DecisionData memory d = POICodec.decodeDecision(a.data);

        if (a.data.length != DECISION_HEAD_BYTES + PARENTS_LENGTH_BYTES + 32 * d.parents.length) {
            revert MalformedPayload();
        }

        // I1 — 결정과 트리거는 비어 있을 수 없다. 근거·이유는 선택이므로 검사하지 않는다.
        if (d.decisionCommitment == 0 || d.triggerCommitment == 0) revert EmptyCommitment();
        if (d.parents.length > MAX_PARENTS) revert TooManyParents(); // I14

        // I12 — refUID는 parents[0]과 일치해야 한다. EAS의 참조와 POI의 DAG가 갈라지면
        // 인덱서마다 다른 그래프를 그린다.
        bytes32 wantRef = d.parents.length > 0 ? d.parents[0] : bytes32(0);
        if (a.refUID != wantRef) revert RefUIDMismatch();

        _checkParents(d.parents, a);
        _checkPromotedNote(d.promotedFromNote, a);
        _checkVerifiedAddress(d.verifiedAddressUID, a.attester);
        _checkOutcome(d, a.time);

        return true;
    }

    /// @dev E6 validDAG. 같은 지갑의, 더 이른, 살아 있는 결정만 부모가 될 수 있다.
    function _checkParents(bytes32[] memory parents, Attestation calldata a) private view {
        for (uint256 i; i < parents.length; ++i) {
            Attestation memory p = _eas.getAttestation(parents[i]);
            if (p.uid == 0) revert ParentNotFound();
            if (p.schema != schemaUID) revert ParentWrongSchema();
            if (p.attester != a.attester) revert ParentNotSameActor(); // I3
            if (p.time >= a.time) revert ParentNotEarlier(); // I2
            if (p.revocationTime != 0) revert ParentRevoked();
        }
    }

    /// @dev I3b — 타인의 노트를 승격 원본으로 쓸 수 없다. 쓸 수 있으면 남의 t0을 자기 것으로 주장한다.
    function _checkPromotedNote(bytes32 noteUID, Attestation calldata a) private view {
        if (noteUID == 0) return;

        Attestation memory n = _eas.getAttestation(noteUID);
        if (n.uid == 0) revert NoteNotFound();
        if (n.schema != noteSchemaUID) revert NoteWrongSchema();
        if (n.attester != a.attester) revert NoteNotSameActor();
        if (n.time >= a.time) revert NoteNotEarlier();
    }

    /// @dev B4 — 커밋 시점의 검증 상태 스냅샷. **필수가 아니다**(미검증 지갑도 허용).
    ///      다만 넣었다면 실재하고 발행자 본인의 것이어야 한다.
    function _checkVerifiedAddress(bytes32 verifiedUID, address attester) private view {
        if (verifiedUID == 0) return;

        Attestation memory v = _eas.getAttestation(verifiedUID);
        if (v.uid == 0 || v.recipient != attester) revert BadVerifiedUID();
    }

    /// @dev I4~I6. `hasExpectedOutcome=false`면 나머지 필드가 전부 0이어야 한다(I6d) —
    ///      쓰레기 값이 남으면 인덱서가 선언하지 않은 조건을 표시할 수 있다.
    function _checkOutcome(POICodec.DecisionData memory d, uint64 attestTime) private view {
        if (!d.hasExpectedOutcome) {
            if (
                d.outcomeMetricId != 0 || d.outcomeOp != 0 || d.outcomeThreshold != 0 || d.windowStart != 0
                    || d.windowEnd != 0 || d.graceSeconds != 0
            ) revert OutcomeFieldsMustBeZero();
            return;
        }

        if (!metrics[d.outcomeMetricId].allowed) revert MetricNotAllowed(); // I5
        if (d.outcomeOp > MAX_OP) revert OpOutOfRange();

        // ★ I4 — 구간이 커밋 시점보다 미래여야 한다. 이 한 줄이 사후 서사 재구성을 막는다.
        if (d.windowStart < attestTime) revert WindowInPast();
        if (d.windowStart > attestTime + MAX_START_DELAY) revert WindowStartTooFar(); // I6a
        if (d.windowEnd <= d.windowStart) revert WindowInvalid();
        if (d.windowEnd - d.windowStart > MAX_WINDOW) revert WindowTooLong(); // I6b
        if (d.graceSeconds < MIN_GRACE || d.graceSeconds > MAX_GRACE) revert GraceOutOfRange(); // I6c
    }

    /// @dev 스키마가 비철회이므로 EAS가 이 경로 전에 막는다.
    function onRevoke(Attestation calldata, uint256) internal pure override returns (bool) {
        return true;
    }
}
