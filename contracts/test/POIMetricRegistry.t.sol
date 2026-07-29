// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {POIMetricRegistry} from "../src/POIMetricRegistry.sol";
import {POIResolverBase} from "../src/POIResolverBase.sol";

contract RegistryHarness is POIMetricRegistry {
    constructor(IEAS eas) POIResolverBase(eas) {}

    function initialize(bytes32 uid) external {
        _initializeBase(uid);
    }

    function onAttest(Attestation calldata, uint256) internal pure override returns (bool) {
        return true;
    }

    function onRevoke(Attestation calldata, uint256) internal pure override returns (bool) {
        return true;
    }
}

/// @notice C7 — append-only 지표 레지스트리 (B13, §11).
contract POIMetricRegistryTest is Test {
    RegistryHarness internal reg;
    address internal constant ALICE = address(0xA11CE);
    bytes32 internal constant VOL30 = keccak256("BTC_30D_REALIZED_VOL_AT_END");
    bytes32 internal constant DEF_HASH = keccak256("docs/metrics/BTC_30D_REALIZED_VOL_AT_END.md");

    event MetricAdded(bytes32 indexed metricId, uint8 decimals, uint8 kind, bytes32 definitionHash);

    function setUp() public {
        reg = new RegistryHarness(IEAS(address(0xEA5)));
    }

    function _spec() internal pure returns (POIMetricRegistry.MetricSpec memory) {
        return POIMetricRegistry.MetricSpec({
            allowed: true,
            decimals: 1,
            kind: 0, // WINDOW_END_EVALUATED
            definitionHash: DEF_HASH,
            frozen: false // 호출자가 무엇을 넣든 등록 시 true로 강제된다
        });
    }

    function test_AddMetric_StoresAndFreezes() public {
        vm.expectEmit(true, false, false, true);
        emit MetricAdded(VOL30, 1, 0, DEF_HASH);
        reg.addMetric(VOL30, _spec());

        (bool allowed, uint8 decimals, uint8 kind, bytes32 definitionHash, bool frozen) = reg.metrics(VOL30);
        assertTrue(allowed);
        assertEq(decimals, 1);
        assertEq(kind, 0);
        assertEq(definitionHash, DEF_HASH);
        assertTrue(frozen, "registration must freeze immediately");
    }

    /// @dev ★ B13 — decimals나 definitionHash를 바꾸면 과거 결정의 해석이 소급 변경된다.
    /// @dev 봉인 후에는 소유자도 지표를 추가할 수 없다.
    ///      Phase 1 에서는 **호출하지 않는다** — 지표를 더 등록해야 한다.
    function test_SealRegistry_BlocksFurtherAdds() public {
        reg.sealRegistry();
        assertTrue(reg.registrySealed());
        vm.expectRevert(POIMetricRegistry.RegistryIsSealed.selector);
        reg.addMetric(VOL30, _spec());
    }

    function test_AddMetric_RevertsOnReregistration() public {
        reg.addMetric(VOL30, _spec());

        POIMetricRegistry.MetricSpec memory changed = _spec();
        changed.decimals = 4;
        vm.expectRevert(POIMetricRegistry.MetricFrozen.selector);
        reg.addMetric(VOL30, changed);

        (, uint8 decimals,,,) = reg.metrics(VOL30);
        assertEq(decimals, 1, "original decimals must survive");
    }

    /// @dev §11.3 — 정의 문서가 없으면 "누구나 같은 절차로 재현"이 성립하지 않는다.
    function test_AddMetric_RevertsWithoutDefinitionHash() public {
        POIMetricRegistry.MetricSpec memory s = _spec();
        s.definitionHash = bytes32(0);
        vm.expectRevert(POIMetricRegistry.MetricDefinitionRequired.selector);
        reg.addMetric(VOL30, s);
    }

    /// @dev 경로 존재형은 단일 (값, 시각)으로 부재를 증명할 수 없어 MVP에서 제외한다 (B7).
    function test_AddMetric_RevertsOnUnsupportedKind() public {
        POIMetricRegistry.MetricSpec memory s = _spec();
        s.kind = 1; // PATH_EXISTENCE
        vm.expectRevert(POIMetricRegistry.MetricKindUnsupported.selector);
        reg.addMetric(VOL30, s);
    }

    /// @dev allowed=false로 등록하면 영구히 사용 불가인 항목이 동결된다 — 실수를 막는다.
    function test_AddMetric_RevertsWhenNotAllowed() public {
        POIMetricRegistry.MetricSpec memory s = _spec();
        s.allowed = false;
        vm.expectRevert(POIMetricRegistry.MetricMustBeAllowed.selector);
        reg.addMetric(VOL30, s);
    }

    function test_AddMetric_RevertsOnZeroId() public {
        vm.expectRevert(POIMetricRegistry.ZeroMetricId.selector);
        reg.addMetric(bytes32(0), _spec());
    }

    function test_AddMetric_RevertsForNonOwner() public {
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, ALICE));
        reg.addMetric(VOL30, _spec());
    }

    /// @dev 등록되지 않은 지표는 조회 시 allowed=false — I5(MetricNotAllowed)의 전제.
    function test_UnknownMetric_IsNotAllowed() public view {
        (bool allowed,,,, bool frozen) = reg.metrics(keccak256("STRATEGY_SHARPE"));
        assertFalse(allowed);
        assertFalse(frozen);
    }

    /// @dev 서로 다른 지표는 독립적으로 추가된다 — append-only의 나머지 절반.
    function test_AddMetric_AllowsDifferentIds() public {
        reg.addMetric(VOL30, _spec());
        bytes32 other = keccak256("BTC_PRICE_KRW_AT_END");
        POIMetricRegistry.MetricSpec memory s = _spec();
        s.decimals = 0;
        s.definitionHash = keccak256("docs/metrics/BTC_PRICE_KRW_AT_END.md");
        reg.addMetric(other, s);

        (, uint8 d0,,,) = reg.metrics(VOL30);
        (, uint8 d1,,,) = reg.metrics(other);
        assertEq(d0, 1);
        assertEq(d1, 0);
    }
}
