// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {POIResolverBase} from "../src/POIResolverBase.sol";
import {POIChallengeResolver} from "../src/POIChallengeResolver.sol";
import {POICodec} from "../src/POICodec.sol";
import {MockEAS} from "./mocks/MockEAS.sol";

/// @notice C6 — `poi.challenge.v1` 리졸버. B8과 I15를 실제 EAS 진입점에서 고정한다.
contract POIChallengeResolverTest is Test {
    MockEAS internal eas;
    POIChallengeResolver internal r;

    bytes32 internal constant CHALLENGE_SCHEMA = keccak256("poi.challenge.v1");
    bytes32 internal constant SETTLEMENT_SCHEMA = keccak256("poi.settlement.v1");
    bytes32 internal constant DECISION_SCHEMA = keccak256("poi.decision.v1");
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA201);

    bytes32 internal settlementUID;

    function setUp() public {
        eas = new MockEAS();
        r = new POIChallengeResolver(IEAS(address(eas)));
        r.initialize(CHALLENGE_SCHEMA, SETTLEMENT_SCHEMA);

        settlementUID = keccak256("settlement");
        _storeSettlement(settlementUID, SETTLEMENT_SCHEMA, 0);
    }

    // --- 헬퍼 --------------------------------------------------------------

    function _storeSettlement(bytes32 uid, bytes32 schema, uint64 revocationTime) internal {
        eas.set(
            Attestation({
                uid: uid,
                schema: schema,
                time: 1,
                expirationTime: 0,
                revocationTime: revocationTime,
                refUID: keccak256("decision"),
                recipient: address(0),
                attester: ALICE,
                revocable: true,
                data: ""
            })
        );
    }

    function _challenge() internal view returns (POICodec.ChallengeData memory c) {
        c.settlementUID = settlementUID;
        c.claimedResult = 1;
        c.hasObservedValue = true;
        c.observedValue = 500;
        c.source = "upbit";
        c.observedAt = 1_800_000_000;
        c.noteCommitment = keccak256("challenge note");
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

    function _attestation(bytes32 uid, address attester, POICodec.ChallengeData memory c)
        internal
        view
        returns (Attestation memory)
    {
        return Attestation({
            uid: uid,
            schema: CHALLENGE_SCHEMA,
            time: uint64(block.timestamp),
            expirationTime: 0,
            revocationTime: 0,
            refUID: c.settlementUID,
            recipient: address(0),
            attester: attester,
            revocable: true,
            data: _challengeData(c)
        });
    }

    function _attestation(POICodec.ChallengeData memory c) internal view returns (Attestation memory) {
        return _attestation(keccak256("C1"), BOB, c);
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

    function _issue(bytes32 uid, address attester) internal returns (Attestation memory a) {
        a = _attestation(uid, attester, _challenge());
        assertTrue(_attest(a));
        eas.set(a);
    }

    // --- 통과 경로 ----------------------------------------------------------

    function test_Attest_AcceptsChallenge() public {
        Attestation memory a = _attestation(_challenge());
        assertTrue(_attest(a));
        assertEq(r.activeChallenge(settlementUID, BOB), a.uid);
    }

    function test_Attest_AcceptsChallengesFromDifferentActors() public {
        Attestation memory bob = _issue(keccak256("C-bob"), BOB);
        Attestation memory carol = _issue(keccak256("C-carol"), CAROL);
        assertEq(r.activeChallenge(settlementUID, BOB), bob.uid);
        assertEq(r.activeChallenge(settlementUID, CAROL), carol.uid);
    }

    /// @dev 이의는 온체인 판정 대상이 아니므로 관측값이 없어도 허용한다.
    function test_Attest_AcceptsChallengeWithoutObservedValue() public {
        POICodec.ChallengeData memory c = _challenge();
        c.hasObservedValue = false;
        c.observedValue = 0;
        assertTrue(_attest(_attestation(c)));
    }

    // --- 이의 검증 ----------------------------------------------------------

    function test_Attest_RevertsOnIrrevocable() public {
        Attestation memory a = _attestation(_challenge());
        a.revocable = false;
        vm.expectRevert(POIChallengeResolver.MustBeRevocable.selector);
        _attest(a);
    }

    function test_Attest_RevertsOnTrailingBytes() public {
        Attestation memory a = _attestation(_challenge());
        a.data = bytes.concat(a.data, bytes32(uint256(1)));
        vm.expectRevert(POIChallengeResolver.MalformedPayload.selector);
        _attest(a);
    }

    function test_Attest_RevertsOnDirtyStringPadding() public {
        bytes memory data = _challengeData(_challenge());
        data[data.length - 1] = 0xFF;
        Attestation memory a = _attestation(_challenge());
        a.data = data;
        vm.expectRevert(POIChallengeResolver.MalformedPayload.selector);
        _attest(a);
    }

    function test_Attest_RevertsOnRefUIDMismatch() public {
        Attestation memory a = _attestation(_challenge());
        a.refUID = keccak256("unrelated");
        vm.expectRevert(POIChallengeResolver.RefUIDMismatch.selector);
        _attest(a);
    }

    function test_Attest_RevertsOnResultOutOfRange() public {
        POICodec.ChallengeData memory c = _challenge();
        c.claimedResult = 3;
        vm.expectRevert(POIChallengeResolver.ResultOutOfRange.selector);
        _attest(_attestation(c));
    }

    function test_Attest_RevertsOnMissingSettlement() public {
        POICodec.ChallengeData memory c = _challenge();
        c.settlementUID = keccak256("never stored");
        vm.expectRevert(POIChallengeResolver.SettlementNotFound.selector);
        _attest(_attestation(c));
    }

    function test_Attest_RevertsOnSettlementWrongSchema() public {
        POICodec.ChallengeData memory c = _challenge();
        c.settlementUID = keccak256("decision");
        _storeSettlement(c.settlementUID, DECISION_SCHEMA, 0);
        vm.expectRevert(POIChallengeResolver.SettlementWrongSchema.selector);
        _attest(_attestation(c));
    }

    function test_Attest_RevertsOnRevokedSettlement() public {
        _storeSettlement(settlementUID, SETTLEMENT_SCHEMA, 2);
        vm.expectRevert(POIChallengeResolver.SettlementRevoked.selector);
        _attest(_attestation(_challenge()));
    }

    function test_Attest_RevertsOnSecondActiveChallenge() public {
        _issue(keccak256("C1"), BOB);
        vm.expectRevert(POIChallengeResolver.AlreadyChallenged.selector);
        _attest(_attestation(keccak256("C2"), BOB, _challenge()));
    }

    // --- 철회 후 재발행 (B8) ------------------------------------------------

    function test_Revoke_AllowsReissueAfterRevoke() public {
        Attestation memory c1 = _issue(keccak256("C1"), BOB);
        assertTrue(_revoke(c1));
        assertEq(r.activeChallenge(settlementUID, BOB), bytes32(0));

        Attestation memory c2 = _issue(keccak256("C2"), BOB);
        assertEq(r.activeChallenge(settlementUID, BOB), c2.uid);
    }

    function test_Revoke_StaleRevokeDoesNotClearActive() public {
        Attestation memory c1 = _issue(keccak256("C1"), BOB);
        _revoke(c1);
        Attestation memory c2 = _issue(keccak256("C2"), BOB);

        _revoke(c1);
        assertEq(r.activeChallenge(settlementUID, BOB), c2.uid);
    }

    function test_Revoke_OnlyClearsOwnActorSlot() public {
        Attestation memory bob = _issue(keccak256("C-bob"), BOB);
        Attestation memory carol = _issue(keccak256("C-carol"), CAROL);

        _revoke(bob);
        assertEq(r.activeChallenge(settlementUID, BOB), bytes32(0));
        assertEq(r.activeChallenge(settlementUID, CAROL), carol.uid);
    }

    // --- 기본 가드 (C2 상속) -------------------------------------------------

    function test_Attest_RevertsOnExpiration() public {
        Attestation memory a = _attestation(_challenge());
        a.expirationTime = uint64(block.timestamp + 1 days);
        vm.expectRevert(POIResolverBase.MustBePermanent.selector);
        _attest(a);
    }

    function test_Attest_RevertsOnWrongSchema() public {
        Attestation memory a = _attestation(_challenge());
        a.schema = DECISION_SCHEMA;
        vm.expectRevert(POIResolverBase.WrongSchema.selector);
        _attest(a);
    }

    function test_Attest_RevertsOnNonZeroRecipient() public {
        Attestation memory a = _attestation(_challenge());
        a.recipient = ALICE;
        vm.expectRevert(POIResolverBase.RecipientMustBeZero.selector);
        _attest(a);
    }

    function test_Attest_RevertsBeforeInitialize() public {
        POIChallengeResolver fresh = new POIChallengeResolver(IEAS(address(eas)));
        vm.expectRevert(POIResolverBase.NotInitialized.selector);
        vm.prank(address(eas));
        fresh.attest(_attestation(_challenge()));
    }

    function test_Initialize_RevertsOnZeroSettlementSchema() public {
        POIChallengeResolver fresh = new POIChallengeResolver(IEAS(address(eas)));
        vm.expectRevert(POIResolverBase.ZeroSchemaUID.selector);
        fresh.initialize(CHALLENGE_SCHEMA, bytes32(0));
    }
}
