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
 * O7 1단계 — 데모용 결정 2건을 커밋한다.
 *
 * **O4와 같은 관측 구간은 쓸 수 없다.** 그 창은 이미 과거고 불변식 I4가
 * `windowStart >= 커밋 시각`을 강제한다. 소급 설정 차단이 이 제품의 핵심 방어라
 * 데모 편의로 우회하지 않는다. 대신 지금부터 짧은 창을 연다.
 *
 *   windowStart = now + 300   (시뮬레이션 시각이 채굴 블록보다 이르므로 여유)
 *   windowEnd   = windowStart + 600
 *   grace       = 1시간
 *
 * 따라서 windowEnd 이후 ~1시간 안에 2단계(정산)를 실행하면 SETTLED가 된다.
 *
 * **UID는 이 스크립트 출력이 아니라 broadcast 영수증의 Attested 이벤트에서 읽을 것.**
 * EAS UID는 블록 시각을 포함해 시뮬레이션 값과 다르다 (O4에서 실제로 틀렸다).
 */
contract O7Commit is Script {
    bytes32 internal constant DECISION_TAG = keccak256("poi.commit.decision.v1");
    bytes16 internal constant SETTLED_SALT = 0xa1b2c3d4e5f60718293a4b5c6d7e8f90;
    string internal constant SETTLED_PAYLOAD = "{\"fixture\":\"O7-settled\",\"intent\":\"demo\"}";
    bytes16 internal constant REVOKED_SALT = 0x1122334455667788990aabbccddeeff0;
    string internal constant REVOKED_PAYLOAD = "{\"fixture\":\"O7-revoked\",\"intent\":\"demo\"}";

    function run() external {
        address eas = vm.envAddress("O7_EAS");
        bytes32 schema = vm.envBytes32("O7_DECISION_SCHEMA_UID");
        bytes32 metricId = vm.envBytes32("O7_METRIC_ID");
        address attester = vm.envAddress("O7_ATTESTER");

        uint64 windowStart = uint64(block.timestamp) + 300;
        uint64 windowEnd = windowStart + 600;

        vm.startBroadcast();
        _commit(eas, schema, metricId, attester, SETTLED_SALT, SETTLED_PAYLOAD, windowStart, windowEnd);
        _commit(eas, schema, metricId, attester, REVOKED_SALT, REVOKED_PAYLOAD, windowStart, windowEnd);
        vm.stopBroadcast();

        console2.log("windowStart", windowStart);
        console2.log("windowEnd == observedAt (I8)", windowEnd);
        console2.log("settle after", windowEnd);
        console2.log("SETTLED deadline", uint256(windowEnd) + 3600);
    }

    function _commit(
        address eas,
        bytes32 schema,
        bytes32 metricId,
        address attester,
        bytes16 salt,
        string memory payload,
        uint64 windowStart,
        uint64 windowEnd
    ) private {
        POICodec.DecisionData memory d;
        d.parents = new bytes32[](0);
        d.decisionCommitment = keccak256(
            abi.encodePacked(DECISION_TAG, bytes32(block.chainid), attester, salt, bytes(payload))
        );
        d.triggerCommitment = keccak256(abi.encodePacked("o7-trigger", salt));
        d.hasExpectedOutcome = true;
        d.outcomeMetricId = metricId;
        d.outcomeOp = 0; // GT — 관측값이 임계값보다 크다
        d.outcomeThreshold = 1;
        d.windowStart = windowStart;
        d.windowEnd = windowEnd;
        d.graceSeconds = 1 hours;
        // 도장 검증 스냅샷. 없으면 0 — 컨트랙트가 미검증 지갑으로 기록한다.
        d.verifiedAddressUID = vm.envOr("POI_VERIFIED_ADDRESS_UID", bytes32(0));

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
        console2.log("commitment");
        console2.logBytes32(d.decisionCommitment);
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
