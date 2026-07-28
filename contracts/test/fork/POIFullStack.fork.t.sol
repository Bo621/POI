// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {
    IEAS,
    AttestationRequest,
    AttestationRequestData,
    RevocationRequest,
    RevocationRequestData
} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {EASForkBase} from "./EASForkBase.sol";
import {POICodec} from "../../src/POICodec.sol";
import {POIResolverBase} from "../../src/POIResolverBase.sol";
import {POIMetricRegistry} from "../../src/POIMetricRegistry.sol";
import {POINoteResolver} from "../../src/POINoteResolver.sol";
import {POIDecisionResolver} from "../../src/POIDecisionResolver.sol";
import {POISettlementResolver} from "../../src/POISettlementResolver.sol";
import {POIChallengeResolver} from "../../src/POIChallengeResolver.sol";

library ForkPOIEncoder {
    function decisionData(POICodec.DecisionData memory d) internal pure returns (bytes memory) {
        bytes memory wrappedParents = abi.encode(d.parents);
        bytes memory parents;
        assembly ("memory-safe") {
            parents := add(wrappedParents, 0x20)
            mstore(parents, sub(mload(wrappedParents), 0x20))
        }
        return bytes.concat(
            abi.encode(
                uint256(14 * 32),
                d.promotedFromNote,
                d.verifiedAddressUID,
                d.decisionCommitment,
                d.triggerCommitment,
                d.evidenceCommitment,
                d.reasonCommitment
            ),
            abi.encode(
                d.hasExpectedOutcome,
                d.outcomeMetricId,
                d.outcomeOp,
                d.outcomeThreshold,
                d.windowStart,
                d.windowEnd,
                d.graceSeconds
            ),
            parents
        );
    }
}

contract POIFullStackForkTest is EASForkBase {
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    bytes32 internal constant METRIC = keccak256("BTC_30D_REALIZED_VOL_AT_END");

    POINoteResolver internal note;
    POIDecisionResolver internal decision;
    POISettlementResolver internal settlement;
    POIChallengeResolver internal challenge;

    bytes32 internal noteUID;
    bytes32 internal decisionUID;
    bytes32 internal settlementUID;
    bytes32 internal challengeUID;
    uint64 internal t0;

    function setUp() public {
        _forkSetUp();
        if (!forkAvailable) return;

        t0 = uint64(block.timestamp);

        note = new POINoteResolver(IEAS(EAS_ADDR));
        decision = new POIDecisionResolver(IEAS(EAS_ADDR));
        settlement = new POISettlementResolver(IEAS(EAS_ADDR));
        challenge = new POIChallengeResolver(IEAS(EAS_ADDR));

        noteUID = _registerSchema("bytes32 contentCommitment", address(note), false);
        decisionUID = _registerSchema(
            "bytes32[] parents,bytes32 promotedFromNote,bytes32 verifiedAddressUID,bytes32 decisionCommitment,bytes32 triggerCommitment,bytes32 evidenceCommitment,bytes32 reasonCommitment,bool hasExpectedOutcome,bytes32 outcomeMetricId,uint8 outcomeOp,int128 outcomeThreshold,uint64 windowStart,uint64 windowEnd,uint32 graceSeconds",
            address(decision),
            false
        );
        settlementUID = _registerSchema(
            "bytes32 decisionUID,uint8 result,bool hasObservedValue,int128 observedValue,string source,uint64 observedAt,string verifierVersion,bytes32 supersedes",
            address(settlement),
            true
        );
        challengeUID = _registerSchema(
            "bytes32 settlementUID,uint8 claimedResult,bool hasObservedValue,int128 observedValue,string source,uint64 observedAt,bytes32 noteCommitment",
            address(challenge),
            true
        );

        note.initialize(noteUID);
        decision.initialize(decisionUID, noteUID);
        settlement.initialize(settlementUID, decisionUID);
        challenge.initialize(challengeUID, settlementUID);
        decision.addMetric(
            METRIC,
            POIMetricRegistry.MetricSpec({
                allowed: true, decimals: 1, kind: 0, definitionHash: keccak256("docs/metrics/vol30.md"), frozen: false
            })
        );
    }

    function _decisionData(POICodec.DecisionData memory d) internal pure returns (bytes memory) {
        return ForkPOIEncoder.decisionData(d);
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

    function _challengeData(POICodec.ChallengeData memory c) internal pure returns (bytes memory) {
        return abi.encode(
            c.settlementUID,
            c.claimedResult,
            c.hasObservedValue,
            c.observedValue,
            c.source,
            c.observedAt,
            c.noteCommitment
        );
    }

    function _okDecision() internal view returns (POICodec.DecisionData memory d) {
        d.parents = new bytes32[](0);
        d.decisionCommitment = keccak256("decision");
        d.triggerCommitment = keccak256("trigger");
        d.hasExpectedOutcome = true;
        d.outcomeMetricId = METRIC;
        d.outcomeOp = 1;
        d.outcomeThreshold = 600;
        d.windowStart = uint64(block.timestamp);
        d.windowEnd = uint64(block.timestamp + 30 days);
        d.graceSeconds = 1 hours;
    }

    function _okSettlement(bytes32 dUID, uint64 observedAt) internal pure returns (POICodec.SettlementData memory s) {
        s.decisionUID = dUID;
        s.result = 0;
        s.hasObservedValue = true;
        s.observedValue = 700;
        s.source = "upbit";
        s.observedAt = observedAt;
        s.verifierVersion = "poi-verifier/1.0.0";
    }

    function _okChallenge(bytes32 sUID) internal pure returns (POICodec.ChallengeData memory c) {
        c.settlementUID = sUID;
        c.claimedResult = 1;
        c.hasObservedValue = true;
        c.observedValue = 500;
        c.source = "upbit";
        c.observedAt = 1_800_000_000;
        c.noteCommitment = keccak256("challenge note");
    }

    function _issueNote(address attester, bytes32 commitment) internal returns (bytes32) {
        return _attest(noteUID, attester, false, bytes32(0), abi.encode(commitment));
    }

    function _issueDecision(address attester, POICodec.DecisionData memory d) internal returns (bytes32) {
        bytes32 refUID = d.parents.length == 0 ? bytes32(0) : d.parents[0];
        return _attest(decisionUID, attester, false, refUID, _decisionData(d));
    }

    function _issueSettlement(address attester, POICodec.SettlementData memory s) internal returns (bytes32) {
        return _attest(settlementUID, attester, true, s.decisionUID, _settlementData(s));
    }

    function _issueChallenge(address attester, POICodec.ChallengeData memory c) internal returns (bytes32) {
        return _attest(challengeUID, attester, true, c.settlementUID, _challengeData(c));
    }

    function _revoke(bytes32 schema, bytes32 uid, address attester) internal {
        vm.prank(attester);
        eas.revoke(RevocationRequest({schema: schema, data: RevocationRequestData({uid: uid, value: 0})}));
    }

    function _issueDecisionAndWarp() internal returns (bytes32 dUID, uint64 windowEnd) {
        POICodec.DecisionData memory d = _okDecision();
        windowEnd = d.windowEnd;
        dUID = _issueDecision(ALICE, d);
        vm.warp(windowEnd);
    }

    function _issueSettlementForChallenge() internal returns (bytes32 sUID) {
        (bytes32 dUID, uint64 windowEnd) = _issueDecisionAndWarp();
        sUID = _issueSettlement(ALICE, _okSettlement(dUID, windowEnd));
    }

    function test_Fork_HappyPath_NoteToDecisionToSettlement() public {
        bytes32 nUID = _issueNote(ALICE, keccak256("note"));
        vm.warp(block.timestamp + 1);
        POICodec.DecisionData memory d = _okDecision();
        d.promotedFromNote = nUID;
        bytes32 dUID = _issueDecision(ALICE, d);
        vm.warp(d.windowEnd);
        bytes32 sUID = _issueSettlement(ALICE, _okSettlement(dUID, d.windowEnd));

        assertEq(settlement.activeHead(dUID), sUID);
    }

    function test_Fork_HappyPath_Challenge() public {
        bytes32 sUID = _issueSettlementForChallenge();
        bytes32 cUID = _issueChallenge(BOB, _okChallenge(sUID));

        assertEq(challenge.activeChallenge(sUID, BOB), cUID);
    }

    function test_Fork_CT01_ForeignSettlement() public {
        (bytes32 dUID, uint64 windowEnd) = _issueDecisionAndWarp();
        vm.expectRevert(POISettlementResolver.NotDecisionOwner.selector);
        _issueSettlement(BOB, _okSettlement(dUID, windowEnd));
    }

    function test_Fork_CT02_IrrevocableSettlement() public {
        (bytes32 dUID, uint64 windowEnd) = _issueDecisionAndWarp();
        POICodec.SettlementData memory s = _okSettlement(dUID, windowEnd);
        vm.expectRevert(POISettlementResolver.MustBeRevocable.selector);
        _attest(settlementUID, ALICE, false, dUID, _settlementData(s));
    }

    function test_Fork_CT03_ExpirationTime() public {
        vm.prank(ALICE);
        vm.expectRevert(POIResolverBase.MustBePermanent.selector);
        eas.attest(
            AttestationRequest({
                schema: noteUID,
                data: AttestationRequestData({
                    recipient: address(0),
                    expirationTime: uint64(block.timestamp + 1 days),
                    revocable: false,
                    refUID: bytes32(0),
                    data: abi.encode(keccak256("expiring note")),
                    value: 0
                })
            })
        );
    }

    function test_Fork_CT04_ResultMismatch() public {
        (bytes32 dUID, uint64 windowEnd) = _issueDecisionAndWarp();
        POICodec.SettlementData memory s = _okSettlement(dUID, windowEnd);
        s.result = 1;
        vm.expectRevert(POISettlementResolver.ResultMismatch.selector);
        _issueSettlement(ALICE, s);
    }

    function test_Fork_CT05_ObservedWithoutValue() public {
        (bytes32 dUID, uint64 windowEnd) = _issueDecisionAndWarp();
        POICodec.SettlementData memory s = _okSettlement(dUID, windowEnd);
        s.hasObservedValue = false;
        vm.expectRevert(POISettlementResolver.MustBeIndeterminate.selector);
        _issueSettlement(ALICE, s);
    }

    function test_Fork_CT06_ObservedAtNotWindowEnd() public {
        (bytes32 dUID, uint64 windowEnd) = _issueDecisionAndWarp();
        POICodec.SettlementData memory s = _okSettlement(dUID, windowEnd);
        s.observedAt = windowEnd - 1;
        vm.expectRevert(POISettlementResolver.ObservedAtMustBeWindowEnd.selector);
        _issueSettlement(ALICE, s);
    }

    function test_Fork_CT07_SupersedeAfterRevoke() public {
        (bytes32 dUID, uint64 windowEnd) = _issueDecisionAndWarp();
        bytes32 s1 = _issueSettlement(ALICE, _okSettlement(dUID, windowEnd));
        _revoke(settlementUID, s1, ALICE);
        POICodec.SettlementData memory s = _okSettlement(dUID, windowEnd);
        s.supersedes = s1;
        bytes32 s2 = _issueSettlement(ALICE, s);

        assertEq(settlement.activeHead(dUID), s2);
        assertEq(settlement.revokeCount(dUID), 1);
    }

    function test_Fork_CT08_ReissueWithoutSupersede() public {
        (bytes32 dUID, uint64 windowEnd) = _issueDecisionAndWarp();
        bytes32 s1 = _issueSettlement(ALICE, _okSettlement(dUID, windowEnd));
        _revoke(settlementUID, s1, ALICE);
        vm.expectRevert(POISettlementResolver.MustSupersede.selector);
        _issueSettlement(ALICE, _okSettlement(dUID, windowEnd));
    }

    function test_Fork_CT09_PriorStillActive() public {
        (bytes32 dUID, uint64 windowEnd) = _issueDecisionAndWarp();
        bytes32 s1 = _issueSettlement(ALICE, _okSettlement(dUID, windowEnd));
        POICodec.SettlementData memory s = _okSettlement(dUID, windowEnd);
        s.supersedes = s1;
        vm.expectRevert(POISettlementResolver.PriorStillActive.selector);
        _issueSettlement(ALICE, s);
    }

    function test_Fork_CT10_UnrelatedSupersedes() public {
        (bytes32 dUID, uint64 windowEnd) = _issueDecisionAndWarp();
        bytes32 s1 = _issueSettlement(ALICE, _okSettlement(dUID, windowEnd));
        _revoke(settlementUID, s1, ALICE);
        bytes32 unrelatedUID = _issueNote(ALICE, keccak256("unrelated"));
        POICodec.SettlementData memory s = _okSettlement(dUID, windowEnd);
        s.supersedes = unrelatedUID;
        vm.expectRevert(POISettlementResolver.SupersedesNotLastHead.selector);
        _issueSettlement(ALICE, s);
    }

    function test_Fork_CT11_WindowInPast() public {
        POICodec.DecisionData memory d = _okDecision();
        d.windowStart = t0 - 1;
        vm.expectRevert(POIDecisionResolver.WindowInPast.selector);
        _issueDecision(ALICE, d);
    }

    function test_Fork_CT12_GraceOutOfRange() public {
        POICodec.DecisionData memory d = _okDecision();
        d.graceSeconds = 30 minutes;
        vm.expectRevert(POIDecisionResolver.GraceOutOfRange.selector);
        _issueDecision(ALICE, d);

        d.graceSeconds = 31 days;
        vm.expectRevert(POIDecisionResolver.GraceOutOfRange.selector);
        _issueDecision(ALICE, d);
    }

    function test_Fork_CT13_ForeignNotePromotion() public {
        bytes32 nUID = _issueNote(BOB, keccak256("bob note"));
        vm.warp(block.timestamp + 1);
        POICodec.DecisionData memory d = _okDecision();
        d.promotedFromNote = nUID;
        vm.expectRevert(POIDecisionResolver.NoteNotSameActor.selector);
        _issueDecision(ALICE, d);
    }

    function test_Fork_CT14_UnknownMetric() public {
        POICodec.DecisionData memory d = _okDecision();
        d.outcomeMetricId = keccak256("UNKNOWN_METRIC");
        vm.expectRevert(POIDecisionResolver.MetricNotAllowed.selector);
        _issueDecision(ALICE, d);
    }

    function test_Fork_CT15_RefUIDMismatch() public {
        (bytes32 dUID, uint64 windowEnd) = _issueDecisionAndWarp();
        bytes32 otherUID = _issueNote(ALICE, keccak256("other real attestation"));
        POICodec.SettlementData memory s = _okSettlement(dUID, windowEnd);
        vm.expectRevert(POISettlementResolver.RefUIDMismatch.selector);
        _attest(settlementUID, ALICE, true, otherUID, _settlementData(s));
    }

    function test_Fork_CT16_NineParents() public {
        bytes32[] memory parents = new bytes32[](9);
        for (uint256 i; i < parents.length; ++i) {
            POICodec.DecisionData memory parent = _okDecision();
            parent.decisionCommitment = keccak256(abi.encodePacked("decision", i));
            parent.triggerCommitment = keccak256(abi.encodePacked("trigger", i));
            parents[i] = _issueDecision(ALICE, parent);
            vm.warp(block.timestamp + 1);
        }

        POICodec.DecisionData memory d = _okDecision();
        d.parents = parents;
        vm.expectRevert(POIDecisionResolver.TooManyParents.selector);
        _issueDecision(ALICE, d);
    }

    function test_Fork_CT17_ChallengeReissueAfterRevoke() public {
        bytes32 sUID = _issueSettlementForChallenge();
        POICodec.ChallengeData memory c = _okChallenge(sUID);
        bytes32 c1 = _issueChallenge(BOB, c);
        _revoke(challengeUID, c1, BOB);
        bytes32 c2 = _issueChallenge(BOB, c);

        assertEq(challenge.activeChallenge(sUID, BOB), c2);
    }

    function test_Fork_CT20_ExpiredVerifiedAddress() public {
        bytes32 verifiedSchemaUID = _registerSchema("bytes32 proof", address(0), true);

        vm.prank(ALICE);
        bytes32 verifiedUID = eas.attest(
            AttestationRequest({
                schema: verifiedSchemaUID,
                data: AttestationRequestData({
                    recipient: ALICE,
                    expirationTime: uint64(block.timestamp + 1 hours),
                    revocable: true,
                    refUID: bytes32(0),
                    data: abi.encode(keccak256("verified")),
                    value: 0
                })
            })
        );

        vm.warp(block.timestamp + 2 hours);
        POICodec.DecisionData memory d = _okDecision();
        d.verifiedAddressUID = verifiedUID;
        vm.expectRevert(POIDecisionResolver.VerifiedAddressExpired.selector);
        _issueDecision(ALICE, d);
    }

    function test_Fork_CT19_MetricFrozen() public {
        vm.expectRevert(POIMetricRegistry.MetricFrozen.selector);
        decision.addMetric(
            METRIC,
            POIMetricRegistry.MetricSpec({
                allowed: true, decimals: 1, kind: 0, definitionHash: keccak256("docs/metrics/vol30.md"), frozen: false
            })
        );
    }
}
