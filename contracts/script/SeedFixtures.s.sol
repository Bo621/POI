// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console2} from "forge-std/Script.sol";
import {
    IEAS,
    AttestationRequest,
    AttestationRequestData,
    RevocationRequest,
    RevocationRequestData
} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {Deploy} from "./Deploy.s.sol";
import {POICodec} from "../src/POICodec.sol";
import {POIMetricRegistry} from "../src/POIMetricRegistry.sol";
import {POIDecisionResolver} from "../src/POIDecisionResolver.sol";

contract SeedFixtures is Deploy {
    bytes32 internal constant PRICE_METRIC =
        0x83b04966e07f0f83592e71060b3356d716b4dff9f824bd76d0f9d149c54cafcf;
    bytes32 internal constant DRAWDOWN_METRIC =
        0x5d3da88eb99efa2feecd925b5d459912f5ef402d66358620376805c0bad076d3;
    bytes32 internal constant PRICE_DEFINITION =
        0xdb9b1a42f8c680812394e611605ef7d4406b2b83746014f1f7c5a9e60fe47a75;
    bytes32 internal constant DRAWDOWN_DEFINITION =
        0x34a268d1b42b47674cbc1fd6a3dbabc9cc5de97381a9ea72c5fce7172a522581;
    bytes32 internal constant DECISION_TAG = keccak256("poi.commit.decision.v1");
    bytes16 internal constant F1_SALT = 0x00112233445566778899aabbccddeeff;
    string internal constant F1_PAYLOAD = "{\"fixture\":\"F1\",\"intent\":\"seed-success\"}";

    function runSeed() external {
        uint256 phase = vm.envUint("SEED_PHASE");
        if (phase == 1) return _phase1();
        if (phase == 2) return _phase2();
        if (phase == 3) return _phase3();
        revert("SEED_PHASE must be 1, 2, or 3");
    }

    function _phase1() private {
        uint256 keyA = vm.envUint("SEED_KEY_A");
        address actorA = vm.addr(keyA);
        uint64 t0 = uint64(vm.envUint("SEED_T0"));
        int128 priceThreshold = int128(vm.envInt("SEED_PRICE_THRESHOLD"));
        int128 drawdownThreshold = int128(vm.envInt("SEED_DRAWDOWN_THRESHOLD"));

        vm.startBroadcast(keyA);
        Deployment memory d = _deploy();
        POIDecisionResolver decision = POIDecisionResolver(payable(d.decision));
        decision.addMetric(
            PRICE_METRIC,
            POIMetricRegistry.MetricSpec(true, 0, 0, PRICE_DEFINITION, false)
        );
        decision.addMetric(
            DRAWDOWN_METRIC,
            POIMetricRegistry.MetricSpec(true, 1, 0, DRAWDOWN_DEFINITION, false)
        );

        bytes32 f1Commitment = keccak256(
            abi.encodePacked(DECISION_TAG, bytes32(block.chainid), actorA, F1_SALT, bytes(F1_PAYLOAD))
        );
        bytes32 f1 = _attestDecision(
            IEAS(DEFAULT_EAS), d.decisionSchemaUID,
            _outcome(f1Commitment, keccak256("f1-trigger"), PRICE_METRIC, 1, priceThreshold, t0 + 60, t0 + 660)
        );
        bytes32 f2 = _attestDecision(
            IEAS(DEFAULT_EAS), d.decisionSchemaUID,
            _outcome(keccak256("f2-decision"), keccak256("f2-trigger"), DRAWDOWN_METRIC, 1, drawdownThreshold, t0 + 60, t0 + 660)
        );
        bytes32 f4 = _attestDecision(
            IEAS(DEFAULT_EAS), d.decisionSchemaUID,
            _outcome(keccak256("f4-decision"), keccak256("f4-trigger"), PRICE_METRIC, 1, 1, t0 + 60, t0 + 660)
        );
        bytes32 f5 = _attestDecision(
            IEAS(DEFAULT_EAS), d.decisionSchemaUID,
            _outcome(keccak256("f5-decision"), keccak256("f5-trigger"), PRICE_METRIC, 1, 1, t0 + 7200, t0 + 93600)
        );
        vm.stopBroadcast();

        _logDeployment(d);
        _logBytes32("SEED_F1_UID=", f1);
        _logBytes32("SEED_F2_UID=", f2);
        _logBytes32("SEED_F4_UID=", f4);
        _logBytes32("SEED_F5_UID=", f5);
        _logBytes32("SEED_F1_COMMITMENT=", f1Commitment);
    }

    function _phase2() private {
        uint256 keyA = vm.envUint("SEED_KEY_A");
        IEAS eas = IEAS(DEFAULT_EAS);
        bytes32 settlementSchema = vm.envBytes32("SEED_SETTLEMENT_SCHEMA_UID");
        uint64 observedAt = uint64(vm.envUint("SEED_WINDOW_END"));
        int128 price = int128(vm.envInt("SEED_PRICE_VALUE"));
        int128 drawdown = int128(vm.envInt("SEED_DRAWDOWN_VALUE"));

        vm.startBroadcast(keyA);
        bytes32 f1Settlement = _attestSettlement(
            eas, settlementSchema,
            POICodec.SettlementData(
                vm.envBytes32("SEED_F1_UID"), 0, true, price, "upbit:KRW-BTC:1m",
                observedAt, "poi-verifier/0.1.0", bytes32(0)
            )
        );
        int128 wrongDrawdown = drawdown + 500;
        bytes32 f2Settlement1 = _attestSettlement(
            eas, settlementSchema,
            POICodec.SettlementData(
                vm.envBytes32("SEED_F2_UID"), 0, true, wrongDrawdown, "upbit:KRW-BTC:1m",
                observedAt, "poi-verifier/0.1.0", bytes32(0)
            )
        );
        vm.stopBroadcast();

        _logBytes32("SEED_F1_SETTLEMENT_UID=", f1Settlement);
        _logBytes32("SEED_F2_SETTLEMENT_S1_UID=", f2Settlement1);
    }

    function _phase3() private {
        uint256 keyA = vm.envUint("SEED_KEY_A");
        uint256 keyB = vm.envUint("SEED_KEY_B");
        IEAS eas = IEAS(DEFAULT_EAS);
        bytes32 decisionSchema = vm.envBytes32("SEED_DECISION_SCHEMA_UID");
        bytes32 settlementSchema = vm.envBytes32("SEED_SETTLEMENT_SCHEMA_UID");
        bytes32 challengeSchema = vm.envBytes32("SEED_CHALLENGE_SCHEMA_UID");
        bytes32 f2UID = vm.envBytes32("SEED_F2_UID");
        bytes32 f2S1 = vm.envBytes32("SEED_F2_SETTLEMENT_S1_UID");
        uint64 observedAt = uint64(vm.envUint("SEED_WINDOW_END"));
        int128 drawdown = int128(vm.envInt("SEED_DRAWDOWN_VALUE"));

        vm.startBroadcast(keyA);
        eas.revoke(
            RevocationRequest({
                schema: settlementSchema,
                data: RevocationRequestData({uid: f2S1, value: 0})
            })
        );
        bytes32 f2S2 = _attestSettlement(
            eas, settlementSchema,
            POICodec.SettlementData(
                f2UID, 1, true, drawdown, "upbit:KRW-BTC:1m",
                observedAt, "poi-verifier/0.1.0", f2S1
            )
        );
        vm.stopBroadcast();

        vm.startBroadcast(keyB);
        bytes32 challengeUID = _attestChallenge(
            eas, challengeSchema,
            POICodec.ChallengeData(
                vm.envBytes32("SEED_F1_SETTLEMENT_UID"), 1, true,
                int128(vm.envInt("SEED_PRICE_VALUE") - 1), "manual:seed-challenge",
                observedAt, keccak256("seed challenge note")
            )
        );
        POICodec.DecisionData memory copied;
        copied.parents = new bytes32[](0);
        copied.decisionCommitment = vm.envBytes32("SEED_F1_COMMITMENT");
        copied.triggerCommitment = keccak256("copy-trigger");
        bytes32 copyUID = _attestDecision(eas, decisionSchema, copied);
        vm.stopBroadcast();

        _logBytes32("SEED_F2_SETTLEMENT_S2_UID=", f2S2);
        _logBytes32("SEED_F1_CHALLENGE_UID=", challengeUID);
        _logBytes32("SEED_F_COPY_UID=", copyUID);
    }

    function _outcome(
        bytes32 decisionCommitment,
        bytes32 triggerCommitment,
        bytes32 metricId,
        uint8 op,
        int128 threshold,
        uint64 windowStart,
        uint64 windowEnd
    ) private pure returns (POICodec.DecisionData memory d) {
        d.parents = new bytes32[](0);
        d.decisionCommitment = decisionCommitment;
        d.triggerCommitment = triggerCommitment;
        d.hasExpectedOutcome = true;
        d.outcomeMetricId = metricId;
        d.outcomeOp = op;
        d.outcomeThreshold = threshold;
        d.windowStart = windowStart;
        d.windowEnd = windowEnd;
        d.graceSeconds = 1 hours;
    }

    function _attestDecision(IEAS eas, bytes32 schema, POICodec.DecisionData memory d)
        private returns (bytes32)
    {
        bytes32 refUID = d.parents.length == 0 ? bytes32(0) : d.parents[0];
        return _attest(eas, schema, false, refUID, _decisionData(d));
    }

    function _attestSettlement(IEAS eas, bytes32 schema, POICodec.SettlementData memory s)
        private returns (bytes32)
    {
        return _attest(
            eas, schema, true, s.decisionUID,
            abi.encode(
                s.decisionUID, s.result, s.hasObservedValue, s.observedValue,
                s.source, s.observedAt, s.verifierVersion, s.supersedes
            )
        );
    }

    function _attestChallenge(IEAS eas, bytes32 schema, POICodec.ChallengeData memory c)
        private returns (bytes32)
    {
        return _attest(
            eas, schema, true, c.settlementUID,
            abi.encode(
                c.settlementUID, c.claimedResult, c.hasObservedValue, c.observedValue,
                c.source, c.observedAt, c.noteCommitment
            )
        );
    }

    function _attest(IEAS eas, bytes32 schema, bool revocable, bytes32 refUID, bytes memory data)
        private returns (bytes32)
    {
        return eas.attest(
            AttestationRequest({
                schema: schema,
                data: AttestationRequestData({
                    recipient: address(0),
                    expirationTime: 0,
                    revocable: revocable,
                    refUID: refUID,
                    data: data,
                    value: 0
                })
            })
        );
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
                uint256(14 * 32), d.promotedFromNote, d.verifiedAddressUID,
                d.decisionCommitment, d.triggerCommitment, d.evidenceCommitment, d.reasonCommitment
            ),
            abi.encode(
                d.hasExpectedOutcome, d.outcomeMetricId, d.outcomeOp, d.outcomeThreshold,
                d.windowStart, d.windowEnd, d.graceSeconds
            ),
            parents
        );
    }

    function _logDeployment(Deployment memory d) private pure {
        console2.log("SEED_NOTE_RESOLVER=", d.note);
        console2.log("SEED_DECISION_RESOLVER=", d.decision);
        console2.log("SEED_SETTLEMENT_RESOLVER=", d.settlement);
        console2.log("SEED_CHALLENGE_RESOLVER=", d.challenge);
        _logBytes32("SEED_NOTE_SCHEMA_UID=", d.noteSchemaUID);
        _logBytes32("SEED_DECISION_SCHEMA_UID=", d.decisionSchemaUID);
        _logBytes32("SEED_SETTLEMENT_SCHEMA_UID=", d.settlementSchemaUID);
        _logBytes32("SEED_CHALLENGE_SCHEMA_UID=", d.challengeSchemaUID);
    }

    function _logBytes32(string memory label, bytes32 value) private pure {
        console2.log(label);
        console2.logBytes32(value);
    }
}
