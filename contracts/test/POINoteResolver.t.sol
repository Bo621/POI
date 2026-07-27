// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {InvalidEAS, AccessDenied} from "@ethereum-attestation-service/eas-contracts/contracts/Common.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {POIResolverBase} from "../src/POIResolverBase.sol";
import {POINoteResolver} from "../src/POINoteResolver.sol";

/// @notice C3 — `poi.note.v1` 리졸버 (§5.1).
/// @dev EAS를 흉내내지 않고 **실제 진입점**(`SchemaResolver.attest`, onlyEAS)을 통해 검증한다.
///      onAttest를 직접 노출해 테스트하면 실제 호출 경로에서만 드러나는 문제를 놓친다.
contract POINoteResolverTest is Test {
    POINoteResolver internal r;
    address internal constant EAS = address(0xEA5);
    address internal constant ALICE = address(0xA11CE);
    bytes32 internal constant NOTE_SCHEMA = keccak256("poi.note.v1");

    function setUp() public {
        r = new POINoteResolver(IEAS(EAS));
        r.initialize(NOTE_SCHEMA);
    }

    function _note(bytes32 commitment) internal view returns (Attestation memory) {
        return Attestation({
            uid: keccak256("uid"),
            schema: NOTE_SCHEMA,
            time: uint64(block.timestamp),
            expirationTime: 0,
            revocationTime: 0,
            refUID: bytes32(0),
            recipient: address(0),
            attester: ALICE,
            revocable: false,
            data: abi.encode(commitment)
        });
    }

    function _attest(Attestation memory a) internal returns (bool) {
        vm.prank(EAS);
        return r.attest(a);
    }

    function test_Attest_AcceptsValidNote() public {
        assertTrue(_attest(_note(keccak256("content"))));
    }

    /// @dev 빈 커밋을 허용하면 "무언가를 확정했다"는 주장이 내용 없이 성립한다.
    function test_Attest_RevertsOnEmptyCommitment() public {
        vm.expectRevert(POIResolverBase.EmptyCommitment.selector);
        _attest(_note(bytes32(0)));
    }

    /// @dev ★ 노트는 영구 기록이다. attestation 레벨 revocable도 막아야 표시가 어긋나지 않는다(§1.2).
    function test_Attest_RevertsOnRevocable() public {
        Attestation memory a = _note(keccak256("content"));
        a.revocable = true;
        vm.expectRevert(POINoteResolver.MustBeIrrevocable.selector);
        _attest(a);
    }

    /// @dev V10 / B5.
    function test_Attest_RevertsOnExpiration() public {
        Attestation memory a = _note(keccak256("content"));
        a.expirationTime = uint64(block.timestamp + 1 days);
        vm.expectRevert(POIResolverBase.MustBePermanent.selector);
        _attest(a);
    }

    function test_Attest_RevertsOnWrongSchema() public {
        Attestation memory a = _note(keccak256("content"));
        a.schema = keccak256("poi.decision.v1");
        vm.expectRevert(POIResolverBase.WrongSchema.selector);
        _attest(a);
    }

    function test_Attest_RevertsOnNonZeroRecipient() public {
        Attestation memory a = _note(keccak256("content"));
        a.recipient = ALICE;
        vm.expectRevert(POIResolverBase.RecipientMustBeZero.selector);
        _attest(a);
    }

    /// @dev EAS 이외의 주소가 리졸버를 직접 호출하는 경로를 EAS 베이스가 막는다.
    function test_Attest_RevertsForNonEASCaller() public {
        Attestation memory a = _note(keccak256("content"));
        vm.prank(ALICE);
        vm.expectRevert(AccessDenied.selector);
        r.attest(a);
    }

    /// @dev §6.6의 배포 창 — 초기화 전에는 발행 자체가 불가능해야 한다.
    function test_Attest_RevertsBeforeInitialize() public {
        POINoteResolver fresh = new POINoteResolver(IEAS(EAS));
        Attestation memory a = _note(keccak256("content"));
        vm.prank(EAS);
        vm.expectRevert(POIResolverBase.NotInitialized.selector);
        fresh.attest(a);
    }

    /// @dev initialize에 onlyOwner를 붙이지 않았는데도 베이스가 막는다 (codex 2R P1).
    function test_Initialize_RevertsForNonOwner() public {
        POINoteResolver fresh = new POINoteResolver(IEAS(EAS));
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, ALICE));
        fresh.initialize(NOTE_SCHEMA);
    }

    /// @dev EAS는 refUID를 스키마에 대해 검증하지 않는다 — 노트는 독립 노드여야 한다 (codex P2).
    function test_Attest_RevertsOnNonZeroRefUID() public {
        Attestation memory a = _note(keccak256("content"));
        a.refUID = keccak256("some other attestation");
        vm.expectRevert(POINoteResolver.RefUIDMustBeZero.selector);
        _attest(a);
    }

    /// @dev 잉여 워드가 실린 payload는 `abi.decode`가 조용히 무시한다 — 길이를 직접 막는다 (codex P2).
    function test_Attest_RevertsOnTrailingPayloadBytes() public {
        Attestation memory a = _note(keccak256("content"));
        a.data = abi.encode(keccak256("content"), uint256(1));
        vm.expectRevert(POINoteResolver.MalformedPayload.selector);
        _attest(a);
    }

    /// @dev 짧은 payload도 마찬가지로 거부한다.
    function test_Attest_RevertsOnShortPayload() public {
        Attestation memory a = _note(keccak256("content"));
        a.data = hex"deadbeef";
        vm.expectRevert(POINoteResolver.MalformedPayload.selector);
        _attest(a);
    }

    function test_Constructor_RevertsOnZeroEAS() public {
        vm.expectRevert(InvalidEAS.selector);
        new POINoteResolver(IEAS(address(0)));
    }
}
