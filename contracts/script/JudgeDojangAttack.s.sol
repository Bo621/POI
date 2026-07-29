// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {POICodec} from "../src/POICodec.sol";

interface IEASAttest {
    struct AttestationRequestData {
        address recipient; uint64 expirationTime; bool revocable;
        bytes32 refUID; bytes data; uint256 value;
    }
    struct AttestationRequest { bytes32 schema; AttestationRequestData data; }
    function attest(AttestationRequest calldata request) external payable returns (bytes32);
}

/**
 * 심사자용 공격 시나리오 — **막히는 것을 보는 것이 목적**이다.
 *
 * 두 가지를 시도한다. 둘 다 되돌아가야 정상이다.
 *
 *   1. 남의 도장 검증 스냅샷을 자기 결정에 붙인다   → BadVerifiedUID
 *      (`recipient != attester` — 남에게 발급된 검증은 내 것이 아니다)
 *   2. 도장이 아닌 attestation 을 검증으로 위장한다 → VerifiedAddressWrongSchema
 *
 * `--broadcast` 없이 돌리면 시뮬레이션만 하고 가스를 쓰지 않는다.
 */
contract JudgeDojangAttack is Script {
    bytes32 internal constant DECISION_TAG = keccak256("poi.commit.decision.v1");

    function run() external {
        address eas = vm.envAddress("ATTACK_EAS");
        bytes32 schema = vm.envBytes32("ATTACK_DECISION_SCHEMA_UID");
        bytes32 metricId = vm.envBytes32("ATTACK_METRIC_ID");
        address attacker = vm.envAddress("ATTACK_ATTESTER");
        bytes32 stolen = vm.envBytes32("ATTACK_STOLEN_UID");

        console2.log(unicode"공격자", attacker);
        console2.log(unicode"훔친 검증 스냅샷");
        console2.logBytes32(stolen);

        vm.startBroadcast();
        IEASAttest(eas).attest(
            IEASAttest.AttestationRequest({
                schema: schema,
                data: IEASAttest.AttestationRequestData({
                    recipient: address(0), expirationTime: 0, revocable: false,
                    refUID: bytes32(0),
                    data: _data(metricId, attacker, stolen),
                    value: 0
                })
            })
        );
        vm.stopBroadcast();
        console2.log(unicode"!!! 통과했다 — 방어가 뚫린 것이다");
    }

    function _data(bytes32 metricId, address attester, bytes32 verified)
        private view returns (bytes memory)
    {
        POICodec.DecisionData memory d;
        d.parents = new bytes32[](0);
        d.verifiedAddressUID = verified;
        d.decisionCommitment = keccak256(
            abi.encodePacked(DECISION_TAG, bytes32(block.chainid), attester, bytes16(0x99000000000000000000000000000000), bytes("attack"))
        );
        d.triggerCommitment = keccak256("attack-trigger");
        d.hasExpectedOutcome = true;
        d.outcomeMetricId = metricId;
        d.outcomeOp = 0;
        d.outcomeThreshold = 1;
        d.windowStart = uint64(block.timestamp) + 300;
        d.windowEnd = d.windowStart + 600;
        d.graceSeconds = 1 hours;

        bytes memory wrapped = abi.encode(d.parents);
        bytes memory parents;
        assembly ("memory-safe") {
            parents := add(wrapped, 0x20)
            mstore(parents, sub(mload(wrapped), 0x20))
        }
        return bytes.concat(
            abi.encode(uint256(14 * 32), d.promotedFromNote, d.verifiedAddressUID,
                d.decisionCommitment, d.triggerCommitment, d.evidenceCommitment, d.reasonCommitment),
            abi.encode(d.hasExpectedOutcome, d.outcomeMetricId, d.outcomeOp, d.outcomeThreshold,
                d.windowStart, d.windowEnd, d.graceSeconds),
            parents
        );
    }
}
