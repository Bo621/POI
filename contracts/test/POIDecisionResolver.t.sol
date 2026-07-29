// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {POIResolverBase} from "../src/POIResolverBase.sol";
import {POIMetricRegistry} from "../src/POIMetricRegistry.sol";
import {POIDecisionResolver} from "../src/POIDecisionResolver.sol";
import {POICodec} from "../src/POICodec.sol";
import {MockEAS} from "./mocks/MockEAS.sol";

/// @notice C4 — `poi.decision.v1` 리졸버 (§5.2, §6.3). I1~I6, I12, I14.
contract POIDecisionResolverTest is Test {
    bytes32 internal constant DOJANG_SCHEMA = keccak256("dojang.verified");
    address internal constant DOJANG_ISSUER = address(0xD0);
    MockEAS internal eas;
    POIDecisionResolver internal r;

    bytes32 internal constant DECISION_SCHEMA = keccak256("poi.decision.v1");
    bytes32 internal constant NOTE_SCHEMA = keccak256("poi.note.v1");
    bytes32 internal constant METRIC = keccak256("BTC_30D_REALIZED_VOL_AT_END");
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    uint64 internal constant NOW = 1_800_000_000;

    function setUp() public {
        vm.warp(NOW);
        eas = new MockEAS();
        r = new POIDecisionResolver(IEAS(address(eas)));
        r.initialize(DECISION_SCHEMA, NOTE_SCHEMA, DOJANG_SCHEMA, DOJANG_ISSUER);
        r.addMetric(
            METRIC,
            POIMetricRegistry.MetricSpec({
                allowed: true,
                decimals: 1,
                kind: 0,
                definitionHash: keccak256("docs/metrics/vol30.md"),
                frozen: false
            })
        );
    }

    // --- 헬퍼 --------------------------------------------------------------

    function _data(POICodec.DecisionData memory d) internal pure returns (bytes memory) {
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

    /// @dev 통과하는 최소 결정 — outcome 선언 포함.
    function _decision() internal pure returns (POICodec.DecisionData memory d) {
        d.parents = new bytes32[](0);
        d.decisionCommitment = keccak256("decision");
        d.triggerCommitment = keccak256("trigger");
        d.hasExpectedOutcome = true;
        d.outcomeMetricId = METRIC;
        d.outcomeOp = 1; // GTE
        d.outcomeThreshold = 600;
        d.windowStart = NOW;
        d.windowEnd = NOW + 30 days;
        d.graceSeconds = 1 hours;
    }

    function _attestation(POICodec.DecisionData memory d) internal view returns (Attestation memory) {
        return Attestation({
            uid: keccak256("self"),
            schema: DECISION_SCHEMA,
            time: uint64(block.timestamp),
            expirationTime: 0,
            revocationTime: 0,
            refUID: d.parents.length > 0 ? d.parents[0] : bytes32(0),
            recipient: address(0),
            attester: ALICE,
            revocable: false,
            data: _data(d)
        });
    }

    function _attest(Attestation memory a) internal returns (bool) {
        vm.prank(address(eas));
        return r.attest(a);
    }

    function _store(bytes32 uid, bytes32 schema, address attester, uint64 time) internal returns (bytes32) {
        Attestation memory a = Attestation({
            uid: uid,
            schema: schema,
            time: time,
            expirationTime: 0,
            revocationTime: 0,
            refUID: bytes32(0),
            recipient: address(0),
            attester: attester,
            revocable: false,
            data: ""
        });
        eas.set(a);
        return uid;
    }

    function _storeVerified(bytes32 uid, address recipient, uint64 expirationTime, uint64 revocationTime)
        internal
        returns (bytes32)
    {
        Attestation memory a = Attestation({
            uid: uid,
            schema: keccak256("dojang.verified"),
            time: NOW - 10 days,
            expirationTime: expirationTime,
            revocationTime: revocationTime,
            refUID: bytes32(0),
            recipient: recipient,
            attester: address(0xD0),
            revocable: true,
            data: ""
        });
        eas.set(a);
        return uid;
    }

    function _parent(address attester, uint64 time) internal returns (bytes32) {
        return _store(keccak256(abi.encodePacked("parent", attester, time)), DECISION_SCHEMA, attester, time);
    }

    // --- 통과 경로 ----------------------------------------------------------

    function test_Attest_AcceptsMinimalDecision() public {
        assertTrue(_attest(_attestation(_decision())));
    }

    /// @dev outcome을 선언하지 않은 결정 — NOT_REQUIRED 경로.
    function test_Attest_AcceptsDecisionWithoutOutcome() public {
        POICodec.DecisionData memory d = _decision();
        d.hasExpectedOutcome = false;
        d.outcomeMetricId = bytes32(0);
        d.outcomeOp = 0;
        d.outcomeThreshold = 0;
        d.windowStart = 0;
        d.windowEnd = 0;
        d.graceSeconds = 0;
        assertTrue(_attest(_attestation(d)));
    }

    function test_Attest_AcceptsParentsAndNote() public {
        POICodec.DecisionData memory d = _decision();
        d.parents = new bytes32[](2);
        d.parents[0] = _parent(ALICE, NOW - 2 days);
        d.parents[1] = _parent(ALICE, NOW - 1 days);
        d.promotedFromNote = _store(keccak256("note"), NOTE_SCHEMA, ALICE, NOW - 3 days);
        assertTrue(_attest(_attestation(d)));
    }

    // --- I1 커밋 ------------------------------------------------------------

    function test_Attest_RevertsOnEmptyDecisionCommitment() public {
        POICodec.DecisionData memory d = _decision();
        d.decisionCommitment = bytes32(0);
        vm.expectRevert(POIResolverBase.EmptyCommitment.selector);
        _attest(_attestation(d));
    }

    function test_Attest_RevertsOnEmptyTriggerCommitment() public {
        POICodec.DecisionData memory d = _decision();
        d.triggerCommitment = bytes32(0);
        vm.expectRevert(POIResolverBase.EmptyCommitment.selector);
        _attest(_attestation(d));
    }

    /// @dev 근거·이유는 선택이다 — 없어도 통과해야 한다 (E7 SELF_DECLARED).
    function test_Attest_AllowsEmptyEvidenceAndReason() public {
        POICodec.DecisionData memory d = _decision();
        d.evidenceCommitment = bytes32(0);
        d.reasonCommitment = bytes32(0);
        assertTrue(_attest(_attestation(d)));
    }

    // --- I14 / I12 부모·참조 -------------------------------------------------

    /// @dev CT16.
    function test_Attest_RevertsOnNineParents() public {
        POICodec.DecisionData memory d = _decision();
        d.parents = new bytes32[](9);
        for (uint256 i; i < 9; ++i) {
            d.parents[i] = _parent(ALICE, NOW - uint64(i + 1) * 1 days);
        }
        vm.expectRevert(POIDecisionResolver.TooManyParents.selector);
        _attest(_attestation(d));
    }

    /// @dev CT15 — refUID와 parents[0]이 갈라지면 인덱서마다 다른 그래프를 그린다.
    function test_Attest_RevertsOnRefUIDMismatch() public {
        POICodec.DecisionData memory d = _decision();
        d.parents = new bytes32[](1);
        d.parents[0] = _parent(ALICE, NOW - 1 days);
        Attestation memory a = _attestation(d);
        a.refUID = keccak256("unrelated");
        vm.expectRevert(POIDecisionResolver.RefUIDMismatch.selector);
        _attest(a);
    }

    /// @dev 부모가 없는데 refUID가 붙은 경우도 막는다.
    function test_Attest_RevertsOnRefUIDWithoutParents() public {
        Attestation memory a = _attestation(_decision());
        a.refUID = keccak256("unrelated");
        vm.expectRevert(POIDecisionResolver.RefUIDMismatch.selector);
        _attest(a);
    }

    function test_Attest_RevertsOnMissingParent() public {
        POICodec.DecisionData memory d = _decision();
        d.parents = new bytes32[](1);
        d.parents[0] = keccak256("never stored");
        vm.expectRevert(POIDecisionResolver.ParentNotFound.selector);
        _attest(_attestation(d));
    }

    function test_Attest_RevertsOnParentWrongSchema() public {
        POICodec.DecisionData memory d = _decision();
        d.parents = new bytes32[](1);
        d.parents[0] = _store(keccak256("noteAsParent"), NOTE_SCHEMA, ALICE, NOW - 1 days);
        vm.expectRevert(POIDecisionResolver.ParentWrongSchema.selector);
        _attest(_attestation(d));
    }

    /// @dev I3 — 타인의 결정을 부모로 삼으면 남의 판단 계보를 자기 것으로 주장하게 된다.
    function test_Attest_RevertsOnParentFromOtherActor() public {
        POICodec.DecisionData memory d = _decision();
        d.parents = new bytes32[](1);
        d.parents[0] = _parent(BOB, NOW - 1 days);
        vm.expectRevert(POIDecisionResolver.ParentNotSameActor.selector);
        _attest(_attestation(d));
    }

    /// @dev I2 — 부모가 더 늦으면 인과가 뒤집힌다.
    function test_Attest_RevertsOnParentNotEarlier() public {
        POICodec.DecisionData memory d = _decision();
        d.parents = new bytes32[](1);
        d.parents[0] = _parent(ALICE, NOW); // 동시각도 금지
        vm.expectRevert(POIDecisionResolver.ParentNotEarlier.selector);
        _attest(_attestation(d));
    }

    function test_Attest_RevertsOnRevokedParent() public {
        POICodec.DecisionData memory d = _decision();
        bytes32 uid = _parent(ALICE, NOW - 1 days);
        Attestation memory p = eas.getAttestation(uid);
        p.revocationTime = NOW - 1 hours;
        eas.set(p);
        d.parents = new bytes32[](1);
        d.parents[0] = uid;
        vm.expectRevert(POIDecisionResolver.ParentRevoked.selector);
        _attest(_attestation(d));
    }

    // --- I3b 노트 승격 -------------------------------------------------------

    /// @dev CT13 — 타인의 노트를 승격 원본으로 쓰면 남의 t0을 자기 것으로 주장한다.
    function test_Attest_RevertsOnNoteFromOtherActor() public {
        POICodec.DecisionData memory d = _decision();
        d.promotedFromNote = _store(keccak256("bobNote"), NOTE_SCHEMA, BOB, NOW - 1 days);
        vm.expectRevert(POIDecisionResolver.NoteNotSameActor.selector);
        _attest(_attestation(d));
    }

    function test_Attest_RevertsOnNoteWrongSchema() public {
        POICodec.DecisionData memory d = _decision();
        d.promotedFromNote = _store(keccak256("notANote"), DECISION_SCHEMA, ALICE, NOW - 1 days);
        vm.expectRevert(POIDecisionResolver.NoteWrongSchema.selector);
        _attest(_attestation(d));
    }

    function test_Attest_RevertsOnMissingNote() public {
        POICodec.DecisionData memory d = _decision();
        d.promotedFromNote = keccak256("never stored");
        vm.expectRevert(POIDecisionResolver.NoteNotFound.selector);
        _attest(_attestation(d));
    }

    function test_Attest_RevertsOnNoteNotEarlier() public {
        POICodec.DecisionData memory d = _decision();
        d.promotedFromNote = _store(keccak256("lateNote"), NOTE_SCHEMA, ALICE, NOW);
        vm.expectRevert(POIDecisionResolver.NoteNotEarlier.selector);
        _attest(_attestation(d));
    }

    // --- B4 Verified Address 스냅샷 -----------------------------------------

    /// @dev 미검증 지갑도 사용 허용 — 0이면 검사 자체를 건너뛴다 (F1).
    function test_Attest_AllowsZeroVerifiedUID() public {
        POICodec.DecisionData memory d = _decision();
        d.verifiedAddressUID = bytes32(0);
        assertTrue(_attest(_attestation(d)));
    }

    function test_Attest_AcceptsOwnVerifiedUID() public {
        POICodec.DecisionData memory d = _decision();
        bytes32 uid = keccak256("verified");
        Attestation memory v = Attestation({
            uid: uid,
            schema: keccak256("dojang.verified"),
            time: NOW - 10 days,
            expirationTime: 0,
            revocationTime: 0,
            refUID: bytes32(0),
            recipient: ALICE,
            attester: address(0xD0),
            revocable: true,
            data: ""
        });
        eas.set(v);
        d.verifiedAddressUID = uid;
        assertTrue(_attest(_attestation(d)));
    }

    /// @dev 타인의 검증 attestation을 자기 스냅샷으로 붙이는 것을 막는다.
    function test_Attest_RevertsOnVerifiedUIDOfOtherActor() public {
        POICodec.DecisionData memory d = _decision();
        bytes32 uid = keccak256("bobVerified");
        Attestation memory v = Attestation({
            uid: uid,
            schema: keccak256("dojang.verified"),
            time: NOW - 10 days,
            expirationTime: 0,
            revocationTime: 0,
            refUID: bytes32(0),
            recipient: BOB,
            attester: address(0xD0),
            revocable: true,
            data: ""
        });
        eas.set(v);
        d.verifiedAddressUID = uid;
        vm.expectRevert(POIDecisionResolver.BadVerifiedUID.selector);
        _attest(_attestation(d));
    }

    function test_Attest_RevertsOnMissingVerifiedUID() public {
        POICodec.DecisionData memory d = _decision();
        d.verifiedAddressUID = keccak256("never stored");
        vm.expectRevert(POIDecisionResolver.BadVerifiedUID.selector);
        _attest(_attestation(d));
    }

    function test_Attest_AcceptsNonExpiringVerifiedUID() public {
        POICodec.DecisionData memory d = _decision();
        d.verifiedAddressUID = _storeVerified(keccak256("non-expiring"), ALICE, 0, 0);
        assertTrue(_attest(_attestation(d)));
    }

    function test_Attest_AcceptsVerifiedUIDExpiringLater() public {
        POICodec.DecisionData memory d = _decision();
        d.verifiedAddressUID = _storeVerified(keccak256("expiring-later"), ALICE, NOW + 1 days, 0);
        assertTrue(_attest(_attestation(d)));
    }

    function test_Attest_RevertsOnExpiredVerifiedUID() public {
        POICodec.DecisionData memory d = _decision();
        d.verifiedAddressUID = _storeVerified(keccak256("expired"), ALICE, NOW - 1, 0);
        vm.expectRevert(POIDecisionResolver.VerifiedAddressExpired.selector);
        _attest(_attestation(d));
    }

    function test_Attest_RevertsOnVerifiedUIDExpiringExactlyNow() public {
        POICodec.DecisionData memory d = _decision();
        d.verifiedAddressUID = _storeVerified(keccak256("expires-now"), ALICE, NOW, 0);
        vm.expectRevert(POIDecisionResolver.VerifiedAddressExpired.selector);
        _attest(_attestation(d));
    }

    function test_Attest_RevertsOnRevokedVerifiedUID() public {
        POICodec.DecisionData memory d = _decision();
        d.verifiedAddressUID = _storeVerified(keccak256("revoked"), ALICE, 0, NOW - 1);
        vm.expectRevert(POIDecisionResolver.VerifiedAddressRevoked.selector);
        _attest(_attestation(d));
    }

    function test_Attest_StillAllowsZeroVerifiedUID() public {
        POICodec.DecisionData memory d = _decision();
        d.verifiedAddressUID = bytes32(0);
        assertTrue(_attest(_attestation(d)));
    }

    // --- B1 Dojang 출처 검증 ------------------------------------------------

    /// @dev 다른 스키마의 attestation 을 검증 스냅샷으로 위장할 수 없다.
    ///      이걸 막지 않으면 "커밋 시점에 검증 지갑이었다"가 거짓이 된다.
    function test_Attest_RevertsOnVerifiedUIDOfWrongSchema() public {
        POICodec.DecisionData memory d = _decision();
        d.verifiedAddressUID = _storeVerifiedWith(keccak256("selfie"), keccak256("some.other.schema"), DOJANG_ISSUER);
        vm.expectRevert(POIDecisionResolver.VerifiedAddressWrongSchema.selector);
        _attest(_attestation(d));
    }

    /// @dev 스키마가 같아도 발급자가 도장이 아니면 자작 attestation 이다.
    function test_Attest_RevertsOnVerifiedUIDOfWrongIssuer() public {
        POICodec.DecisionData memory d = _decision();
        d.verifiedAddressUID = _storeVerifiedWith(keccak256("selfIssued"), DOJANG_SCHEMA, ALICE);
        vm.expectRevert(POIDecisionResolver.VerifiedAddressWrongIssuer.selector);
        _attest(_attestation(d));
    }

    /// @dev 출처를 모르는 상태에서는 스냅샷을 아예 받지 않는다 —
    ///      검사할 수 없는 값을 통과시키는 것보다 거부가 안전하다.
    function test_Attest_RevertsOnVerifiedUIDWhenSourceUnconfigured() public {
        POIDecisionResolver bare = new POIDecisionResolver(IEAS(address(eas)));
        bare.initialize(DECISION_SCHEMA, NOTE_SCHEMA, bytes32(0), address(0));
        POICodec.DecisionData memory d = _decision();
        d.verifiedAddressUID = _storeVerified(keccak256("verified"), ALICE, 0, 0);
        vm.prank(address(eas));
        vm.expectRevert(POIDecisionResolver.VerifiedAddressNotConfigured.selector);
        bare.attest(_attestation(d));
    }

    function _storeVerifiedWith(bytes32 uid, bytes32 schema, address issuer) internal returns (bytes32) {
        Attestation memory v = Attestation({
            uid: uid,
            schema: schema,
            time: NOW - 10 days,
            expirationTime: 0,
            revocationTime: 0,
            refUID: bytes32(0),
            recipient: ALICE,
            attester: issuer,
            revocable: true,
            data: ""
        });
        eas.set(v);
        return uid;
    }

    // --- I4~I6 outcome ------------------------------------------------------

    /// @dev CT14 — 화이트리스트 밖 지표는 재현 절차가 없다.
    function test_Attest_RevertsOnUnknownMetric() public {
        POICodec.DecisionData memory d = _decision();
        d.outcomeMetricId = keccak256("STRATEGY_SHARPE");
        vm.expectRevert(POIDecisionResolver.MetricNotAllowed.selector);
        _attest(_attestation(d));
    }

    function test_Attest_RevertsOnOpOutOfRange() public {
        POICodec.DecisionData memory d = _decision();
        d.outcomeOp = 6;
        vm.expectRevert(POIDecisionResolver.OpOutOfRange.selector);
        _attest(_attestation(d));
    }

    /// @dev ★ CT11 / I4 — 이 검사가 사후 서사 재구성을 막는 지점이다.
    function test_Attest_RevertsOnWindowInPast() public {
        POICodec.DecisionData memory d = _decision();
        d.windowStart = NOW - 1;
        vm.expectRevert(POIDecisionResolver.WindowInPast.selector);
        _attest(_attestation(d));
    }

    /// @dev 커밋 시각과 같은 windowStart는 허용된다 — 경계.
    function test_Attest_AllowsWindowStartAtAttestTime() public {
        POICodec.DecisionData memory d = _decision();
        d.windowStart = NOW;
        assertTrue(_attest(_attestation(d)));
    }

    function test_Attest_RevertsOnWindowStartTooFar() public {
        POICodec.DecisionData memory d = _decision();
        d.windowStart = NOW + 30 days + 1;
        d.windowEnd = d.windowStart + 1 days;
        vm.expectRevert(POIDecisionResolver.WindowStartTooFar.selector);
        _attest(_attestation(d));
    }

    function test_Attest_RevertsOnEmptyWindow() public {
        POICodec.DecisionData memory d = _decision();
        d.windowEnd = d.windowStart;
        vm.expectRevert(POIDecisionResolver.WindowInvalid.selector);
        _attest(_attestation(d));
    }

    function test_Attest_RevertsOnWindowTooLong() public {
        POICodec.DecisionData memory d = _decision();
        d.windowEnd = d.windowStart + 730 days + 1;
        vm.expectRevert(POIDecisionResolver.WindowTooLong.selector);
        _attest(_attestation(d));
    }

    /// @dev CT12 / I6c — B11에서 graceDays(최소 1일) → graceSeconds(최소 1시간)로 바뀐 이유가
    ///      데모 리드타임이다. 하한을 깨면 OVERDUE 시연 자체가 성립하지 않는다.
    function test_Attest_RevertsOnGraceTooShort() public {
        POICodec.DecisionData memory d = _decision();
        d.graceSeconds = 1 hours - 1;
        vm.expectRevert(POIDecisionResolver.GraceOutOfRange.selector);
        _attest(_attestation(d));
    }

    function test_Attest_RevertsOnGraceTooLong() public {
        POICodec.DecisionData memory d = _decision();
        d.graceSeconds = 30 days + 1;
        vm.expectRevert(POIDecisionResolver.GraceOutOfRange.selector);
        _attest(_attestation(d));
    }

    /// @dev I6d — 선언하지 않았는데 값이 남아 있으면 인덱서가 없는 조건을 표시한다.
    function test_Attest_RevertsOnDirtyOutcomeFields() public {
        POICodec.DecisionData memory d = _decision();
        d.hasExpectedOutcome = false;
        vm.expectRevert(POIDecisionResolver.OutcomeFieldsMustBeZero.selector);
        _attest(_attestation(d));
    }

    // --- 공통 가드 ----------------------------------------------------------

    /// @dev CT03 / V10.
    function test_Attest_RevertsOnExpiration() public {
        Attestation memory a = _attestation(_decision());
        a.expirationTime = uint64(block.timestamp + 1 days);
        vm.expectRevert(POIResolverBase.MustBePermanent.selector);
        _attest(a);
    }

    /// @dev 결정도 영구 기록이다 (§1.2 2단계).
    function test_Attest_RevertsOnRevocable() public {
        Attestation memory a = _attestation(_decision());
        a.revocable = true;
        vm.expectRevert(POIDecisionResolver.MustBeIrrevocable.selector);
        _attest(a);
    }

    /// @dev 잉여 워드가 붙은 payload는 `abi.decode`가 무시해 불변식을 전부 통과한다 (codex P2).
    function test_Attest_RevertsOnTrailingPayloadBytes() public {
        Attestation memory a = _attestation(_decision());
        a.data = bytes.concat(a.data, bytes32(uint256(1)));
        vm.expectRevert(POIDecisionResolver.MalformedPayload.selector);
        _attest(a);
    }

    /// @dev 부모가 있는 경우에도 정규 길이가 맞아야 한다.
    function test_Attest_RevertsOnTrailingPayloadBytesWithParents() public {
        POICodec.DecisionData memory d = _decision();
        d.parents = new bytes32[](2);
        d.parents[0] = _parent(ALICE, NOW - 2 days);
        d.parents[1] = _parent(ALICE, NOW - 1 days);
        Attestation memory a = _attestation(d);
        a.data = bytes.concat(a.data, bytes32(uint256(7)));
        vm.expectRevert(POIDecisionResolver.MalformedPayload.selector);
        _attest(a);
    }

    function test_Attest_RevertsBeforeInitialize() public {
        POIDecisionResolver fresh = new POIDecisionResolver(IEAS(address(eas)));
        Attestation memory a = _attestation(_decision());
        vm.prank(address(eas));
        vm.expectRevert(POIResolverBase.NotInitialized.selector);
        fresh.attest(a);
    }

    function test_Initialize_RevertsOnZeroNoteSchema() public {
        POIDecisionResolver fresh = new POIDecisionResolver(IEAS(address(eas)));
        vm.expectRevert(POIResolverBase.ZeroSchemaUID.selector);
        fresh.initialize(DECISION_SCHEMA, bytes32(0), DOJANG_SCHEMA, DOJANG_ISSUER);
        assertFalse(fresh.initialized());
    }
}
