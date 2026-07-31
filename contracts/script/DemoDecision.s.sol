// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {POICodec} from "../src/POICodec.sol";

interface IEASAttest {
    struct AttestationRequestData {
        address recipient;
        uint64 expirationTime;
        bool revocable;
        bytes32 refUID;
        bytes data;
        uint256 value;
    }

    struct AttestationRequest {
        bytes32 schema;
        AttestationRequestData data;
    }

    function attest(AttestationRequest calldata request) external payable returns (bytes32);
}

/**
 * 문서용 데모 결정 1건을 커밋한다.
 *
 * O7Commit 은 임계값을 1 로 하드코딩해 「가격 > 1」이라는 항상 참인 술어를 만든다.
 * 메커니즘 시연에는 충분하지만, 피치덱과 백서는 이 결정을 인용하며
 * 「BTC 가 특정 가격을 넘는다」고 서술해 왔다. 온체인에 없는 조건을 적은 셈이다.
 * 그래서 실제로 의미 있는 임계값을 가진 결정을 새로 발행한다.
 *
 *   windowStart = now + 300   (시뮬레이션 시각이 채굴 블록보다 이르므로 여유)
 *   windowEnd   = windowStart + 600
 *   grace       = 1시간
 *
 * I4 가 windowStart >= 커밋 시각을 강제하므로 과거 구간은 쓸 수 없다.
 *
 * **UID 는 이 스크립트 출력이 아니라 broadcast 영수증의 Attested 이벤트에서 읽을 것.**
 */
contract DemoDecision is Script {
    bytes32 internal constant DECISION_TAG = keccak256("poi.commit.decision.v1");

    function run() external {
        address eas = vm.envAddress("DEMO_EAS");
        bytes32 schema = vm.envBytes32("DEMO_DECISION_SCHEMA_UID");
        bytes32 metricId = vm.envBytes32("DEMO_METRIC_ID");
        address attester = vm.envAddress("DEMO_ATTESTER");
        int128 threshold = int128(vm.envInt("DEMO_THRESHOLD"));
        bytes16 salt = bytes16(vm.envBytes32("DEMO_SALT"));
        string memory payload = vm.envString("DEMO_PAYLOAD");

        uint64 windowStart = uint64(block.timestamp) + 300;
        uint64 windowEnd = windowStart + 600;

        POICodec.DecisionData memory d;
        d.parents = new bytes32[](0);
        d.decisionCommitment = keccak256(
            abi.encodePacked(DECISION_TAG, bytes32(block.chainid), attester, salt, bytes(payload))
        );
        d.triggerCommitment = keccak256(abi.encodePacked("demo-trigger", salt));
        d.hasExpectedOutcome = true;
        d.outcomeMetricId = metricId;
        d.outcomeOp = 0; // GT — 관측값이 임계값보다 크다
        d.outcomeThreshold = threshold;
        d.windowStart = windowStart;
        d.windowEnd = windowEnd;
        d.graceSeconds = 1 hours;
        d.verifiedAddressUID = vm.envOr("POI_VERIFIED_ADDRESS_UID", bytes32(0));

        vm.startBroadcast();
        IEASAttest(eas).attest(
            IEASAttest.AttestationRequest({
                schema: schema,
                data: IEASAttest.AttestationRequestData({
                    recipient: address(0),
                    expirationTime: 0,
                    revocable: false,
                    refUID: bytes32(0),
                    data: _decisionData(d),
                    value: 0
                })
            })
        );
        vm.stopBroadcast();

        console2.log("windowStart", windowStart);
        console2.log("windowEnd", windowEnd);
        console2.log("threshold", vm.toString(int256(threshold)));
        console2.log("commitment");
        console2.logBytes32(d.decisionCommitment);
    }

    function _decisionData(POICodec.DecisionData memory d) private pure returns (bytes memory) {
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
