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
 * O4 — OVERDUE fixture를 배포 직후 즉시 커밋한다.
 *
 * 관측 구간은 지금부터 10분, 유예는 1시간. 따라서 **1시간 10분 뒤**에 「기한초과」가 된다.
 * 시간은 되감을 수 없으므로 이 커밋 시각(T_overdue)을 반드시 기록한다.
 *
 * decisionCommitment는 SeedFixtures와 같은 방식으로 만들어 공개 검증이 가능하다.
 */
contract O4Overdue is Script {
    bytes32 internal constant DECISION_TAG = keccak256("poi.commit.decision.v1");
    bytes16 internal constant SALT = 0x0f1e2d3c4b5a69788796a5b4c3d2e1f0;
    string internal constant PAYLOAD = "{\"fixture\":\"O4\",\"intent\":\"overdue-demo\"}";

    function run() external {
        address eas = vm.envAddress("O4_EAS");
        bytes32 decisionSchema = vm.envBytes32("O4_DECISION_SCHEMA_UID");
        bytes32 metricId = vm.envBytes32("O4_METRIC_ID");
        address attester = vm.envAddress("O4_ATTESTER");

        POICodec.DecisionData memory d;
        d.parents = new bytes32[](0);
        d.decisionCommitment = keccak256(
            abi.encodePacked(DECISION_TAG, bytes32(block.chainid), attester, SALT, bytes(PAYLOAD))
        );
        d.triggerCommitment = keccak256("o4-trigger");
        d.hasExpectedOutcome = true;
        d.outcomeMetricId = metricId;
        d.outcomeOp = 1;
        d.outcomeThreshold = 1;
        // 시뮬레이션 시각은 실제 채굴 블록보다 이르다. 여유 없이 now를 쓰면 WindowInPast()로 되돌아간다.
        d.windowStart = uint64(block.timestamp) + 300;
        d.windowEnd = d.windowStart + 600;
        d.graceSeconds = 1 hours;
        // 도장 검증 스냅샷. 없으면 0 — 컨트랙트가 미검증 지갑으로 기록한다.
        d.verifiedAddressUID = vm.envOr("POI_VERIFIED_ADDRESS_UID", bytes32(0));

        vm.startBroadcast();
        bytes32 uid = IEASAttest(eas).attest(
            IEASAttest.AttestationRequest({
                schema: decisionSchema,
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

        console2.log("O4_UID");
        console2.logBytes32(uid);
        console2.log("O4_COMMITMENT");
        console2.logBytes32(d.decisionCommitment);
        console2.log("T_overdue (windowEnd + grace):", uint256(d.windowEnd) + d.graceSeconds);
        console2.log("windowStart:", d.windowStart);
    }

    /// SeedFixtures._decisionData와 같은 평탄 튜플 인코딩. 앞의 오프셋 워드가 핵심이다.
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
