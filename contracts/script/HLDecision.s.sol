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
 * HL_PERP_OPEN_LONG_QTY 지표로 결정 1건을 커밋한다.
 *
 * 술어는 「선언한 지갑이 이 구간에 롱을 연다」이고 임계값은 0, 연산자는 GT 다.
 * 즉 구간 안에 롱 진입 체결이 하나라도 있으면 맞음이다.
 *
 * **이 결정은 「내가 거래한다」가 아니라 「저 지갑이 거래한다」는 예측이다.**
 * 우리는 그 지갑을 통제하지 않는다. 실행 정합성(본인이 말한 대로 본인이 거래했다)이
 * 되려면 지갑 소유 증명이 붙어야 하고, 그건 아직 없다. 이 결정이 증명하는 것은
 * **온체인 거래 데이터를 POI 의 지표로 쓸 수 있다**는 것까지다.
 *
 * 지갑·종목은 payload 에 평문으로 들어가고 커밋 시점에는 해시로만 올라간다.
 * 공개 시 드러나며, 제3자는 scripts/hl-observe.py 로 같은 값을 다시 구한다.
 *
 * **UID 는 이 스크립트 출력이 아니라 broadcast 영수증의 Attested 이벤트에서 읽을 것.**
 */
contract HLDecision is Script {
    bytes32 internal constant DECISION_TAG = keccak256("poi.commit.decision.v1");
    bytes32 internal constant METRIC_ID =
        0x6c02f2a190b1aaf8d2b9f33160683a9878bb3a46fb71b06bf389d9d2ac3edff5;

    function run() external {
        address eas = vm.envAddress("HL_EAS");
        bytes32 schema = vm.envBytes32("HL_DECISION_SCHEMA_UID");
        address attester = vm.envAddress("HL_ATTESTER");
        bytes16 salt = bytes16(vm.envBytes32("HL_SALT"));
        string memory payload = vm.envString("HL_PAYLOAD");

        uint64 windowStart = uint64(block.timestamp) + uint64(vm.envUint("HL_START_OFFSET"));
        uint64 windowEnd = windowStart + uint64(vm.envUint("HL_WINDOW_SECONDS"));

        POICodec.DecisionData memory d;
        d.parents = new bytes32[](0);
        d.decisionCommitment = keccak256(
            abi.encodePacked(DECISION_TAG, bytes32(block.chainid), attester, salt, bytes(payload))
        );
        d.triggerCommitment = keccak256(abi.encodePacked("hl-trigger", salt));
        d.hasExpectedOutcome = true;
        d.outcomeMetricId = METRIC_ID;
        d.outcomeOp = 0; // GT — 롱 진입 수량이 0 보다 크다
        d.outcomeThreshold = 0;
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
