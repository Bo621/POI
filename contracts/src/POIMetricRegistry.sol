// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {POIResolverBase} from "./POIResolverBase.sol";

/// @title POIMetricRegistry — append-only 지표 레지스트리 (POI_TechSpec_v3.md §6.2 B13, §11)
/// @notice C7. 등록은 허용, 변경·삭제는 금지한다.
///
/// **왜 동결하는가**: 이미 등록된 지표의 `decimals`나 `definitionHash`를 바꾸면
/// 과거 결정의 해석이 **소급 변경된다.** 결정은 t0에 고정됐는데 그 판정 기준이
/// 나중에 움직이면 "결과 이전에 존재했음"이라는 증명 자체가 무의미해진다.
///
/// 그래서 소유권을 `renounce`하지 않는다(베이스에서 구조적으로 차단) — Phase 1에
/// 지표를 **추가**해야 하기 때문이다. 추가는 되고 변경은 안 되는 비대칭이 핵심이다.
abstract contract POIMetricRegistry is POIResolverBase {
    /// @notice MVP가 허용하는 유일한 종류 — 구간 종료 시점 평가 (§11.1 B7).
    /// @dev 경로 존재형(`PATH_EXISTENCE`)은 단일 (값, 시각)으로 부재를 증명할 수 없어 제외한다.
    uint8 internal constant KIND_WINDOW_END_EVALUATED = 0;

    struct MetricSpec {
        bool allowed;
        uint8 decimals;
        uint8 kind;
        bytes32 definitionHash;
        bool frozen;
    }

    mapping(bytes32 metricId => MetricSpec) public metrics;

    error MetricFrozen();
    error RegistryIsSealed();
    error ZeroMetricId();
    error MetricMustBeAllowed();
    error MetricDefinitionRequired();
    error MetricKindUnsupported();

    event MetricAdded(bytes32 indexed metricId, uint8 decimals, uint8 kind, bytes32 definitionHash);

    /// @notice 지표를 등록하고 즉시 동결한다.
    /// @dev `definitionHash == 0`을 거부하는 이유(§11.3): 그 문서가 없으면
    ///      "누구나 같은 절차로 재현"이 성립하지 않는다. 재현 불가능한 지표는
    ///      정산의 근거가 될 수 없으므로 등록 자체를 막는다.
    /// @dev 봉인하면 지표를 영영 추가할 수 없다 — 되돌릴 수 없다.
    ///      **Phase 1 에서는 호출하지 않는다.** 지표를 더 등록해야 한다.
    ///      그동안의 방어는 소유권 multisig 이전이다.
    bool public registrySealed;

    event RegistrySealed();

    function sealRegistry() external onlyOwner {
        registrySealed = true;
        emit RegistrySealed();
    }

    function addMetric(bytes32 metricId, MetricSpec calldata spec) external onlyOwner {
        if (registrySealed) revert RegistryIsSealed();
        if (metrics[metricId].frozen) revert MetricFrozen();
        if (metricId == 0) revert ZeroMetricId();
        if (!spec.allowed) revert MetricMustBeAllowed();
        if (spec.definitionHash == 0) revert MetricDefinitionRequired();
        if (spec.kind != KIND_WINDOW_END_EVALUATED) revert MetricKindUnsupported();

        metrics[metricId] = MetricSpec({
            allowed: true,
            decimals: spec.decimals,
            kind: spec.kind,
            definitionHash: spec.definitionHash,
            frozen: true
        });

        emit MetricAdded(metricId, spec.decimals, spec.kind, spec.definitionHash);
    }
}
