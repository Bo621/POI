// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {POIResolverBase} from "../src/POIResolverBase.sol";
import {POISettlementResolver} from "../src/POISettlementResolver.sol";
import {POICodec} from "../src/POICodec.sol";
import {MockEAS} from "./mocks/MockEAS.sol";

/// @notice C5 — `poi.settlement.v1` 리졸버 (§5.3, §6.4). I7~I13, I16, I17.
///         공격 테스트 CT01·CT02·CT04~CT10을 여기서 고정한다.
contract POISettlementResolverTest is Test {
    MockEAS internal eas;
    POISettlementResolver internal r;

    bytes32 internal constant SETTLEMENT_SCHEMA = keccak256("poi.settlement.v1");
    bytes32 internal constant DECISION_SCHEMA = keccak256("poi.decision.v1");
    bytes32 internal constant METRIC = keccak256("BTC_30D_REALIZED_VOL_AT_END");
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    uint64 internal constant T0 = 1_800_000_000;
    uint64 internal constant WINDOW_END = T0 + 30 days;
    /// @dev 구간 종료 후. 정산은 항상 이 시점에 발행된다.
    uint64 internal constant T_SETTLE = WINDOW_END + 1 hours;

    bytes32 internal decisionUID;

    function setUp() public {
        eas = new MockEAS();
        r = new POISettlementResolver(IEAS(address(eas)));
        r.initialize(SETTLEMENT_SCHEMA, DECISION_SCHEMA);

        decisionUID = _storeDecision(keccak256("decision"), ALICE, _decision());
        vm.warp(T_SETTLE);
    }

    // --- 헬퍼 --------------------------------------------------------------

    function _decision() internal pure returns (POICodec.DecisionData memory d) {
        d.parents = new bytes32[](0);
        d.decisionCommitment = keccak256("decision");
        d.triggerCommitment = keccak256("trigger");
        d.hasExpectedOutcome = true;
        d.outcomeMetricId = METRIC;
        d.outcomeOp = 1; // GTE
        d.outcomeThreshold = 600;
        d.windowStart = T0;
        d.windowEnd = WINDOW_END;
        d.graceSeconds = 1 hours;
    }

    function _decisionData(POICodec.DecisionData memory d) internal pure returns (bytes memory) {
        return abi.encode(
            d.parents,
            d.promotedFromNote,
            d.verifiedAddressUID,
            d.decisionCommitment,
            d.triggerCommitment,
            d.evidenceCommitment,
            d.reasonCommitment,
            d.hasExpectedOutcome,
            d.outcomeMetricId,
            d.outcomeOp,
            d.outcomeThreshold,
            d.windowStart,
            d.windowEnd,
            d.graceSeconds
        );
    }

    function _storeDecision(bytes32 uid, address attester, POICodec.DecisionData memory d) internal returns (bytes32) {
        eas.set(
            Attestation({
                uid: uid,
                schema: DECISION_SCHEMA,
                time: T0,
                expirationTime: 0,
                revocationTime: 0,
                refUID: bytes32(0),
                recipient: address(0),
                attester: attester,
                revocable: false,
                data: _decisionData(d)
            })
        );
        return uid;
    }

    function _settlementData(POICodec.SettlementData memory s) internal pure returns (bytes memory) {
        return abi.encode(
            s.decisionUID,
            s.result,
            s.hasObservedValue,
            s.observedValue,
            s.source,
            s.observedAt,
            s.verifierVersion,
            s.supersedes
        );
    }

    /// @dev 통과하는 최소 정산 — 관측값 700 ≥ 임계 600 이므로 `result = OBSERVED(0)`.
    function _settlement() internal view returns (POICodec.SettlementData memory s) {
        s.decisionUID = decisionUID;
        s.result = 0;
        s.hasObservedValue = true;
        s.observedValue = 700;
        s.source = "upbit";
        s.observedAt = WINDOW_END;
        s.verifierVersion = "poi-verifier/1.0.0";
    }

    function _attestation(bytes32 uid, address attester, POICodec.SettlementData memory s)
        internal
        view
        returns (Attestation memory)
    {
        return Attestation({
            uid: uid,
            schema: SETTLEMENT_SCHEMA,
            time: uint64(block.timestamp),
            expirationTime: 0,
            revocationTime: 0,
            refUID: s.decisionUID,
            recipient: address(0),
            attester: attester,
            revocable: true,
            data: _settlementData(s)
        });
    }

    function _attestation(POICodec.SettlementData memory s) internal view returns (Attestation memory) {
        return _attestation(keccak256("S1"), ALICE, s);
    }

    function _attest(Attestation memory a) internal returns (bool) {
        vm.prank(address(eas));
        return r.attest(a);
    }

    function _revoke(Attestation memory a) internal returns (bool) {
        a.revocationTime = uint64(block.timestamp);
        eas.set(a);
        vm.prank(address(eas));
        return r.revoke(a);
    }

    /// @dev 발행 + EAS 저장. 정정 체인 테스트가 `getAttestation(supersedes)`를 쓴다.
    function _issue(bytes32 uid, POICodec.SettlementData memory s) internal returns (Attestation memory a) {
        a = _attestation(uid, ALICE, s);
        assertTrue(_attest(a));
        eas.set(a);
    }

    // --- 통과 경로 ----------------------------------------------------------

    function test_Attest_AcceptsFirstSettlement() public {
        Attestation memory a = _attestation(_settlement());
        assertTrue(_attest(a));
        assertEq(r.activeHead(decisionUID), a.uid);
        assertEq(r.lastHead(decisionUID), a.uid);
        assertEq(r.revokeCount(decisionUID), 0);
    }

    /// @dev 관측값이 임계 미만이면 `NOT_OBSERVED(1)`이어야 통과한다.
    function test_Attest_AcceptsNotObserved() public {
        POICodec.SettlementData memory s = _settlement();
        s.observedValue = 500;
        s.result = 1;
        assertTrue(_attest(_attestation(s)));
    }

    /// @dev I16 — 관측값이 없으면 INDETERMINATE만 가능하다.
    function test_Attest_AcceptsIndeterminateWithoutValue() public {
        POICodec.SettlementData memory s = _settlement();
        s.hasObservedValue = false;
        s.observedValue = 0;
        s.result = 2;
        assertTrue(_attest(_attestation(s)));
    }

    /// @dev 구간 종료 **정각**도 통과해야 한다 — I7은 `<`이지 `<=`가 아니다.
    function test_Attest_AcceptsAtWindowEndExactly() public {
        vm.warp(WINDOW_END);
        assertTrue(_attest(_attestation(_settlement())));
    }

    // --- 기본 가드 (C2 상속) -------------------------------------------------

    /// @dev CT03 — 만료가 붙은 정산은 "영구 기록"이 아니다.
    function test_Attest_RevertsOnExpiration() public {
        Attestation memory a = _attestation(_settlement());
        a.expirationTime = uint64(block.timestamp + 1 days);
        vm.expectRevert(POIResolverBase.MustBePermanent.selector);
        _attest(a);
    }

    function test_Attest_RevertsOnWrongSchema() public {
        Attestation memory a = _attestation(_settlement());
        a.schema = DECISION_SCHEMA;
        vm.expectRevert(POIResolverBase.WrongSchema.selector);
        _attest(a);
    }

    function test_Attest_RevertsBeforeInitialize() public {
        POISettlementResolver fresh = new POISettlementResolver(IEAS(address(eas)));
        vm.expectRevert(POIResolverBase.NotInitialized.selector);
        vm.prank(address(eas));
        fresh.attest(_attestation(_settlement()));
    }

    function test_Initialize_RevertsOnZeroDecisionSchema() public {
        POISettlementResolver fresh = new POISettlementResolver(IEAS(address(eas)));
        vm.expectRevert(POIResolverBase.ZeroSchemaUID.selector);
        fresh.initialize(SETTLEMENT_SCHEMA, bytes32(0));
    }

    // --- I11 / I12 -----------------------------------------------------------

    /// @dev CT02 — 비철회 정산은 오류를 영구히 못 고친다.
    function test_Attest_RevertsOnIrrevocable() public {
        Attestation memory a = _attestation(_settlement());
        a.revocable = false;
        vm.expectRevert(POISettlementResolver.MustBeRevocable.selector);
        _attest(a);
    }

    /// @dev I12 — refUID가 decisionUID와 갈라지면 EAS 그래프와 POI 그래프가 달라진다.
    function test_Attest_RevertsOnRefUIDMismatch() public {
        Attestation memory a = _attestation(_settlement());
        a.refUID = keccak256("unrelated");
        vm.expectRevert(POISettlementResolver.RefUIDMismatch.selector);
        _attest(a);
    }

    function test_Attest_RevertsOnResultOutOfRange() public {
        POICodec.SettlementData memory s = _settlement();
        s.result = 3;
        vm.expectRevert(POISettlementResolver.ResultOutOfRange.selector);
        _attest(_attestation(s));
    }

    /// @dev 잉여 워드를 붙여도 `abi.decode`는 무시한다 — 비정규 payload가 영구히 남는 것을 막는다.
    function test_Attest_RevertsOnTrailingBytes() public {
        Attestation memory a = _attestation(_settlement());
        a.data = bytes.concat(a.data, bytes32(uint256(1)));
        vm.expectRevert(POISettlementResolver.MalformedPayload.selector);
        _attest(a);
    }

    function test_Attest_RevertsOnDirtyStringPadding() public {
        bytes memory data = _settlementData(_settlement());
        data[data.length - 1] = 0xFF;
        Attestation memory a = _attestation(_settlement());
        a.data = data;
        vm.expectRevert(POISettlementResolver.MalformedPayload.selector);
        _attest(a);
    }

    // --- I10 / I7 결정 검증 ---------------------------------------------------

    function test_Attest_RevertsOnMissingDecision() public {
        POICodec.SettlementData memory s = _settlement();
        s.decisionUID = keccak256("never stored");
        vm.expectRevert(POISettlementResolver.DecisionNotFound.selector);
        _attest(_attestation(s));
    }

    function test_Attest_RevertsOnDecisionWrongSchema() public {
        POICodec.SettlementData memory s = _settlement();
        s.decisionUID = keccak256("noteAsDecision");
        eas.set(
            Attestation({
                uid: s.decisionUID,
                schema: keccak256("poi.note.v1"),
                time: T0,
                expirationTime: 0,
                revocationTime: 0,
                refUID: bytes32(0),
                recipient: address(0),
                attester: ALICE,
                revocable: false,
                data: abi.encode(keccak256("note"))
            })
        );
        vm.expectRevert(POISettlementResolver.DecisionWrongSchema.selector);
        _attest(_attestation(s));
    }

    /// @dev CT01 — 타인이 남의 결정에 head를 꽂는 것을 막는다.
    function test_Attest_RevertsOnForeignDecision() public {
        vm.expectRevert(POISettlementResolver.NotDecisionOwner.selector);
        _attest(_attestation(keccak256("S1"), BOB, _settlement()));
    }

    function test_Attest_RevertsOnRevokedDecision() public {
        Attestation memory dA = eas.getAttestation(decisionUID);
        dA.revocationTime = T0 + 1;
        eas.set(dA);
        vm.expectRevert(POISettlementResolver.DecisionRevoked.selector);
        _attest(_attestation(_settlement()));
    }

    function test_Attest_RevertsOnDecisionWithoutOutcome() public {
        POICodec.DecisionData memory d = _decision();
        d.hasExpectedOutcome = false;
        d.outcomeMetricId = bytes32(0);
        d.outcomeOp = 0;
        d.outcomeThreshold = 0;
        d.windowStart = 0;
        d.windowEnd = 0;
        d.graceSeconds = 0;

        POICodec.SettlementData memory s = _settlement();
        s.decisionUID = _storeDecision(keccak256("noOutcome"), ALICE, d);
        vm.expectRevert(POISettlementResolver.DecisionHasNoOutcome.selector);
        _attest(_attestation(s));
    }

    /// @dev I7 — 구간이 끝나기 전의 정산은 관측이 아니라 예측이다.
    function test_Attest_RevertsBeforeWindowEnd() public {
        vm.warp(WINDOW_END - 1);
        vm.expectRevert(POISettlementResolver.WindowNotEnded.selector);
        _attest(_attestation(_settlement()));
    }

    // --- I8 관측 시점 ---------------------------------------------------------

    /// @dev CT06 — 구간 안 아무 시점이나 관측할 수 있으면 유리한 순간을 골라 관측한다.
    function test_Attest_RevertsOnObservedAtBeforeWindowEnd() public {
        POICodec.SettlementData memory s = _settlement();
        s.observedAt = WINDOW_END - 1;
        vm.expectRevert(POISettlementResolver.ObservedAtMustBeWindowEnd.selector);
        _attest(_attestation(s));
    }

    function test_Attest_RevertsOnObservedAtAfterWindowEnd() public {
        POICodec.SettlementData memory s = _settlement();
        s.observedAt = WINDOW_END + 1;
        vm.expectRevert(POISettlementResolver.ObservedAtMustBeWindowEnd.selector);
        _attest(_attestation(s));
    }

    // --- I16 / I17 온체인 판정 (B6) -------------------------------------------

    /// @dev CT05 — 관측값 없이 OBSERVED를 주장하는 것.
    function test_Attest_RevertsOnObservedWithoutValue() public {
        POICodec.SettlementData memory s = _settlement();
        s.hasObservedValue = false;
        s.observedValue = 0;
        s.result = 0;
        vm.expectRevert(POISettlementResolver.MustBeIndeterminate.selector);
        _attest(_attestation(s));
    }

    function test_Attest_RevertsOnIndeterminateWithValue() public {
        POICodec.SettlementData memory s = _settlement();
        s.result = 2;
        vm.expectRevert(POISettlementResolver.IndeterminateHasValue.selector);
        _attest(_attestation(s));
    }

    /// @dev CT04 ★ — 관측값과 반대되는 result. B6의 핵심.
    function test_Attest_RevertsOnResultMismatch() public {
        POICodec.SettlementData memory s = _settlement();
        s.result = 1; // 700 >= 600 인데 NOT_OBSERVED를 주장
        vm.expectRevert(POISettlementResolver.ResultMismatch.selector);
        _attest(_attestation(s));
    }

    function test_Attest_RevertsOnResultMismatchOtherDirection() public {
        POICodec.SettlementData memory s = _settlement();
        s.observedValue = 599;
        s.result = 0;
        vm.expectRevert(POISettlementResolver.ResultMismatch.selector);
        _attest(_attestation(s));
    }

    /// @dev op 6종 × 경계값. `_eval`이 §5.3 정의와 일치하는지 전수 고정한다.
    function test_Eval_MatchesSpecForAllOpsAtBoundary() public {
        // (op, observed, 기대 result) — 임계는 항상 600.
        uint8[6] memory ops = [0, 1, 2, 3, 4, 5];
        // 각 op에 대해 599 / 600 / 601 에서의 기대 result.
        uint8[3][6] memory expected = [
            [uint8(1), 1, 0], // GT
            [uint8(1), 0, 0], // GTE
            [uint8(0), 1, 1], // LT
            [uint8(0), 0, 1], // LTE
            [uint8(1), 0, 1], // EQ
            [uint8(0), 1, 0] // NEQ
        ];
        int128[3] memory values = [int128(599), int128(600), int128(601)];

        for (uint256 i; i < ops.length; ++i) {
            POICodec.DecisionData memory d = _decision();
            d.outcomeOp = ops[i];

            for (uint256 j; j < values.length; ++j) {
                // 케이스마다 결정을 새로 만든다 — 같은 결정에 두 번 정산하면 I13이 먼저 막는다.
                bytes32 uid = _storeDecision(keccak256(abi.encodePacked("op", i, j)), ALICE, d);
                POICodec.SettlementData memory s = _settlement();
                s.decisionUID = uid;
                s.observedValue = values[j];
                s.result = expected[i][j];
                assertTrue(_attest(_attestation(keccak256(abi.encodePacked("S", i, j)), ALICE, s)), "expected pass");

                // 반대 결과는 반드시 막혀야 한다.
                s.result = expected[i][j] == 0 ? 1 : 0;
                vm.expectRevert(POISettlementResolver.ResultMismatch.selector);
                _attest(_attestation(keccak256(abi.encodePacked("Sx", i, j)), ALICE, s));
            }
        }
    }

    /// @dev 음수 관측값도 int128로 정확히 비교돼야 한다 (uint 변환 사고 방지).
    function test_Eval_HandlesNegativeObservedValue() public {
        POICodec.DecisionData memory d = _decision();
        d.outcomeOp = 2; // LT
        d.outcomeThreshold = -100;
        bytes32 uid = _storeDecision(keccak256("negative"), ALICE, d);

        POICodec.SettlementData memory s = _settlement();
        s.decisionUID = uid;
        s.observedValue = -200;
        s.result = 0; // -200 < -100
        assertTrue(_attest(_attestation(keccak256("Sneg"), ALICE, s)));
    }

    // --- I9 / I13 정정 상태 머신 (B1) -----------------------------------------

    /// @dev CT07 ★ — v2.1이 데드락에 빠지던 경로. S1 철회 후 `supersedes=S1`은 **통과해야 한다**.
    function test_Chain_AllowsSupersedeAfterRevoke() public {
        Attestation memory s1 = _issue(keccak256("S1"), _settlement());
        _revoke(s1);
        assertEq(r.activeHead(decisionUID), bytes32(0));
        assertEq(r.lastHead(decisionUID), s1.uid);
        assertEq(r.revokeCount(decisionUID), 1);

        POICodec.SettlementData memory s2 = _settlement();
        s2.observedValue = 500;
        s2.result = 1;
        s2.supersedes = s1.uid;
        Attestation memory a2 = _issue(keccak256("S2"), s2);

        assertEq(r.activeHead(decisionUID), a2.uid);
        assertEq(r.lastHead(decisionUID), a2.uid);
        assertEq(r.revokeCount(decisionUID), 1);
    }

    /// @dev CT08 ★ — 철회 후 `supersedes=0` 재발행은 정정 이력을 끊는다.
    function test_Chain_RevertsOnReissueWithoutSupersede() public {
        Attestation memory s1 = _issue(keccak256("S1"), _settlement());
        _revoke(s1);

        vm.expectRevert(POISettlementResolver.MustSupersede.selector);
        _attest(_attestation(keccak256("S2"), ALICE, _settlement()));
    }

    /// @dev CT09 — 살아 있는 head가 있는데 정정을 발행하는 것.
    function test_Chain_RevertsWhenPriorStillActive() public {
        Attestation memory s1 = _issue(keccak256("S1"), _settlement());

        POICodec.SettlementData memory s2 = _settlement();
        s2.supersedes = s1.uid;
        vm.expectRevert(POISettlementResolver.PriorStillActive.selector);
        _attest(_attestation(keccak256("S2"), ALICE, s2));
    }

    /// @dev CT10 — 무관한 revoked UID로 supersede.
    function test_Chain_RevertsOnUnrelatedSupersedes() public {
        Attestation memory s1 = _issue(keccak256("S1"), _settlement());
        _revoke(s1);

        POICodec.SettlementData memory s2 = _settlement();
        s2.supersedes = keccak256("unrelated");
        vm.expectRevert(POISettlementResolver.SupersedesNotLastHead.selector);
        _attest(_attestation(keccak256("S2"), ALICE, s2));
    }

    /// @dev lastHead와 일치하지만 스키마가 다른 경우 — MockEAS로 저장 내용을 바꿔 검사한다.
    function test_Chain_RevertsOnSupersedesWrongSchema() public {
        Attestation memory s1 = _issue(keccak256("S1"), _settlement());
        _revoke(s1);

        Attestation memory tampered = eas.getAttestation(s1.uid);
        tampered.schema = DECISION_SCHEMA;
        eas.set(tampered);

        POICodec.SettlementData memory s2 = _settlement();
        s2.supersedes = s1.uid;
        vm.expectRevert(POISettlementResolver.SupersedesWrongSchema.selector);
        _attest(_attestation(keccak256("S2"), ALICE, s2));
    }

    /// @dev `activeHead`가 0인데 대상이 철회되지 않은 상태는 정상 경로로는 만들 수 없다.
    ///      그래도 체인의 마지막 검사가 실제로 동작하는지 고정해 둔다.
    function test_Chain_RevertsOnSupersedesNotRevoked() public {
        Attestation memory s1 = _issue(keccak256("S1"), _settlement());
        _revoke(s1);

        Attestation memory restored = eas.getAttestation(s1.uid);
        restored.revocationTime = 0;
        eas.set(restored);

        POICodec.SettlementData memory s2 = _settlement();
        s2.supersedes = s1.uid;
        vm.expectRevert(POISettlementResolver.SupersedesNotRevoked.selector);
        _attest(_attestation(keccak256("S2"), ALICE, s2));
    }

    /// @dev 정정을 두 번 — S1 → S2 → S3. `lastHead`가 매번 이동한다.
    function test_Chain_AllowsTwoCorrections() public {
        Attestation memory s1 = _issue(keccak256("S1"), _settlement());
        _revoke(s1);

        POICodec.SettlementData memory d2 = _settlement();
        d2.supersedes = s1.uid;
        Attestation memory s2 = _issue(keccak256("S2"), d2);
        _revoke(s2);

        // 옛 head(S1)로 되돌아가는 정정은 막혀야 한다.
        POICodec.SettlementData memory stale = _settlement();
        stale.supersedes = s1.uid;
        vm.expectRevert(POISettlementResolver.SupersedesNotLastHead.selector);
        _attest(_attestation(keccak256("Sx"), ALICE, stale));

        POICodec.SettlementData memory d3 = _settlement();
        d3.supersedes = s2.uid;
        Attestation memory s3 = _issue(keccak256("S3"), d3);

        assertEq(r.activeHead(decisionUID), s3.uid);
        assertEq(r.lastHead(decisionUID), s3.uid);
        assertEq(r.revokeCount(decisionUID), 2);
    }

    /// @dev 철회된 옛 정산을 다시 철회해도 현재 head를 지우면 안 된다.
    function test_Revoke_StaleRevokeDoesNotClearCurrentHead() public {
        Attestation memory s1 = _issue(keccak256("S1"), _settlement());
        _revoke(s1);

        POICodec.SettlementData memory d2 = _settlement();
        d2.supersedes = s1.uid;
        Attestation memory s2 = _issue(keccak256("S2"), d2);

        _revoke(s1); // 뒤늦은 중복 철회
        assertEq(r.activeHead(decisionUID), s2.uid);
        assertEq(r.revokeCount(decisionUID), 1);
    }

    /// @dev 결정이 다르면 상태도 분리돼야 한다.
    function test_Chain_IsolatesDecisions() public {
        _issue(keccak256("S1"), _settlement());

        POICodec.SettlementData memory other = _settlement();
        other.decisionUID = _storeDecision(keccak256("decision2"), ALICE, _decision());
        Attestation memory a = _issue(keccak256("S-other"), other);

        assertEq(r.activeHead(other.decisionUID), a.uid);
        assertEq(r.lastHead(decisionUID), keccak256("S1"));
    }
}
