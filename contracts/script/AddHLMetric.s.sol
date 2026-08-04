// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {POIMetricRegistry} from "../src/POIMetricRegistry.sol";

/**
 * HL_PERP_OPEN_LONG_QTY 지표를 레지스트리에 등록한다.
 *
 * 실행 정합성(「말한 대로 실제로 거래했는가」)을 스키마 변경 없이 표현하기 위한
 * 지표다. DecisionData 에 지갑 필드를 넣으면 배포된 컨트랙트·스키마 UID·공개
 * URL·기존 기록이 전부 깨지므로, 지갑과 종목은 결정 payload 에 선언하고
 * 공개 시 드러내는 방식을 쓴다.
 *
 * 값의 출처는 docs/metrics/HL_PERP_OPEN_LONG_QTY.md 이고, 이 파일의 바이트
 * 해시가 definitionHash 다. 산출은 scripts/hl-observe.py 로 재현된다.
 *
 *   metricId       keccak256("HL_PERP_OPEN_LONG_QTY")
 *   definitionHash keccak256(문서 바이트)
 *   decimals 8 · kind 0 (WINDOW_END_EVALUATED) · frozen
 *
 * **등록 결과는 이 스크립트의 로그가 아니라 broadcast 영수증과 cast call 로 확인할 것.**
 */
contract AddHLMetric is Script {
    bytes32 internal constant METRIC_ID =
        0x6c02f2a190b1aaf8d2b9f33160683a9878bb3a46fb71b06bf389d9d2ac3edff5;
    bytes32 internal constant DEFINITION_HASH =
        0x13b91bb8b4d6a2705c580e9e3cfb317c85aa132875df1630eae82993ec92d026;

    function run() external {
        POIMetricRegistry registry = POIMetricRegistry(payable(vm.envAddress("POI_METRIC_REGISTRY")));

        // 이미 frozen 이면 덮어쓸 수 없다. 먼저 확인하고 멈춘다.
        (bool allowed,,,, bool frozen) = registry.metrics(METRIC_ID);
        if (frozen) {
            console2.log("already frozen - abort");
            return;
        }
        console2.log("allowed before", allowed);

        POIMetricRegistry.MetricSpec memory spec = POIMetricRegistry.MetricSpec({
            allowed: true,
            decimals: 8,
            kind: 0,
            definitionHash: DEFINITION_HASH,
            frozen: true
        });

        vm.startBroadcast();
        registry.addMetric(METRIC_ID, spec);
        vm.stopBroadcast();

        console2.log("metricId");
        console2.logBytes32(METRIC_ID);
        console2.log("definitionHash");
        console2.logBytes32(DEFINITION_HASH);
    }
}
