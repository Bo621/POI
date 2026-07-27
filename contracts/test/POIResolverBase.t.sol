// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {POIResolverBase} from "../src/POIResolverBase.sol";

/// @dev 최소 구현체. 베이스의 가드만 검증하므로 onAttest/onRevoke는 통과시킨다.
contract BaseHarness is POIResolverBase {
    constructor(IEAS eas) POIResolverBase(eas) {}

    /// @dev `_guard`는 internal + calldata라 외부 진입점이 필요하다.
    function guard(Attestation calldata a) external view ready {
        _guard(a, schemaUID);
    }

    /// @dev 초기화 여부와 무관하게 가드만 보는 경로 — `ready`와 `_guard`를 분리해 확인한다.
    function guardWithSchema(Attestation calldata a, bytes32 expected) external pure {
        _guard(a, expected);
    }

    function onAttest(Attestation calldata, uint256) internal pure override returns (bool) {
        return true;
    }

    function onRevoke(Attestation calldata, uint256) internal pure override returns (bool) {
        return true;
    }
}

/// @notice C2 — 공통 가드 (§6.2, B5).
contract POIResolverBaseTest is Test {
    BaseHarness internal r;
    address internal constant EAS = address(0xEA5);
    bytes32 internal constant SCHEMA = keccak256("poi.decision.v1");
    address internal constant ALICE = address(0xA11CE);

    event Initialized(bytes32 indexed schemaUID);

    function setUp() public {
        r = new BaseHarness(IEAS(EAS));
    }

    function _attestation(bytes32 schema) internal view returns (Attestation memory) {
        return Attestation({
            uid: keccak256("uid"),
            schema: schema,
            time: uint64(block.timestamp),
            expirationTime: 0,
            revocationTime: 0,
            refUID: bytes32(0),
            recipient: address(0),
            attester: ALICE,
            revocable: false,
            data: ""
        });
    }

    // --- initialize ---------------------------------------------------------

    function test_Initialize_SetsState() public {
        vm.expectEmit(true, false, false, true);
        emit Initialized(SCHEMA);
        r.initialize(SCHEMA);

        assertTrue(r.initialized());
        assertEq(r.schemaUID(), SCHEMA);
    }

    function test_Initialize_RevertsForNonOwner() public {
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, ALICE));
        r.initialize(SCHEMA);
    }

    function test_Initialize_RevertsOnZeroUID() public {
        vm.expectRevert(POIResolverBase.ZeroSchemaUID.selector);
        r.initialize(bytes32(0));
    }

    /// @dev 재초기화를 허용하면 이미 발행된 attestation의 검증 전제가 소급 변경된다.
    function test_Initialize_RevertsOnSecondCall() public {
        r.initialize(SCHEMA);
        vm.expectRevert(POIResolverBase.AlreadyInitialized.selector);
        r.initialize(keccak256("other"));
    }

    // --- ready --------------------------------------------------------------

    /// @dev §6.6의 배포 1~6 사이 창. 이 가드가 없으면 스키마 UID가 0인 채로 발행이 통과한다.
    function test_Ready_RevertsBeforeInitialize() public {
        Attestation memory a = _attestation(SCHEMA);
        vm.expectRevert(POIResolverBase.NotInitialized.selector);
        r.guard(a);
    }

    function test_Ready_PassesAfterInitialize() public {
        r.initialize(SCHEMA);
        r.guard(_attestation(SCHEMA));
    }

    // --- _guard -------------------------------------------------------------

    /// @dev ★ V10 / B5 — 만료를 허용하면 "영구 기록"이라는 주장이 성립하지 않는다.
    function test_Guard_RevertsOnExpiration() public {
        Attestation memory a = _attestation(SCHEMA);
        a.expirationTime = uint64(block.timestamp + 1 days);
        vm.expectRevert(POIResolverBase.MustBePermanent.selector);
        r.guardWithSchema(a, SCHEMA);
    }

    /// @dev 리졸버가 다른 스키마에 재사용되는 것을 차단한다.
    function test_Guard_RevertsOnWrongSchema() public {
        Attestation memory a = _attestation(keccak256("someone.elses.schema"));
        vm.expectRevert(POIResolverBase.WrongSchema.selector);
        r.guardWithSchema(a, SCHEMA);
    }

    /// @dev POI attestation에는 수취인 개념이 없다.
    function test_Guard_RevertsOnNonZeroRecipient() public {
        Attestation memory a = _attestation(SCHEMA);
        a.recipient = ALICE;
        vm.expectRevert(POIResolverBase.RecipientMustBeZero.selector);
        r.guardWithSchema(a, SCHEMA);
    }

    function test_Guard_PassesOnValidAttestation() public view {
        r.guardWithSchema(_attestation(SCHEMA), SCHEMA);
    }

    // --- 소유권 -------------------------------------------------------------

    /// @dev Ownable2Step — 잘못된 주소로의 즉시 이전을 막는다.
    function test_Ownership_TwoStepTransfer() public {
        r.transferOwnership(ALICE);
        assertEq(r.owner(), address(this), "still owner until accepted");
        assertEq(r.pendingOwner(), ALICE);

        vm.prank(ALICE);
        r.acceptOwnership();
        assertEq(r.owner(), ALICE);
    }

    /// @dev ★ B13 — 소유자가 사라지면 Phase 1 지표 추가가 영구 불가해진다.
    function test_Ownership_RenounceDisabled() public {
        vm.expectRevert(POIResolverBase.RenounceDisabled.selector);
        r.renounceOwnership();
    }

    function test_IsNotPayable() public view {
        assertFalse(r.isPayable());
    }
}
