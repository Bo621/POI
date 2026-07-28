// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {
    IEAS,
    AttestationRequest,
    AttestationRequestData,
    RevocationRequest,
    RevocationRequestData
} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {POICodec} from "../src/POICodec.sol";
import {POIMetricRegistry} from "../src/POIMetricRegistry.sol";

/// @notice Calculation-only seed script. It never broadcasts or mutates chain state.
///         scripts/dev_up.sh sends the emitted transactions with cast send.
contract SeedFixtures is Script {
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

    function runSeed() external view {
        uint256 phase = vm.envUint("SEED_PHASE");
        if (phase == 1) return _phase1();
        if (phase == 2) return _phase2();
        if (phase == 3) return _phase3();
        revert("SEED_PHASE must be 1, 2, or 3");
    }

    function _phase1() private view {
        address actorA = vm.envAddress("SEED_ACTOR_A");
        address decisionResolver = vm.envAddress("SEED_DECISION_RESOLVER");
        bytes32 decisionSchema = vm.envBytes32("SEED_DECISION_SCHEMA_UID");
        uint64 t0 = uint64(vm.envUint("SEED_T0"));
        uint64 finalTs = uint64(vm.envUint("SEED_FINAL_TS"));
        int128 priceThreshold = int128(vm.envInt("SEED_PRICE_THRESHOLD"));
        int128 drawdownThreshold = int128(vm.envInt("SEED_DRAWDOWN_THRESHOLD"));

        _tx(
            "A",
            decisionResolver,
            abi.encodeWithSignature(
                "addMetric(bytes32,(bool,uint8,uint8,bytes32,bool))",
                PRICE_METRIC,
                POIMetricRegistry.MetricSpec(true, 0, 0, PRICE_DEFINITION, false)
            )
        );
        _tx(
            "A",
            decisionResolver,
            abi.encodeWithSignature(
                "addMetric(bytes32,(bool,uint8,uint8,bytes32,bool))",
                DRAWDOWN_METRIC,
                POIMetricRegistry.MetricSpec(true, 1, 0, DRAWDOWN_DEFINITION, false)
            )
        );

        bytes32 f1Commitment = keccak256(
            abi.encodePacked(DECISION_TAG, bytes32(block.chainid), actorA, F1_SALT, bytes(F1_PAYLOAD))
        );
        _attestDecision(
            "A",
            decisionSchema,
            _outcome(
                f1Commitment,
                keccak256("f1-trigger"),
                PRICE_METRIC,
                1,
                priceThreshold,
                t0 + 1800,
                t0 + 2400
            )
        );
        _attestDecision(
            "A",
            decisionSchema,
            _outcome(
                keccak256("f2-decision"),
                keccak256("f2-trigger"),
                DRAWDOWN_METRIC,
                1,
                drawdownThreshold,
                t0 + 1800,
                t0 + 2400
            )
        );
        _attestDecision(
            "A",
            decisionSchema,
            _outcome(
                keccak256("f4-decision"),
                keccak256("f4-trigger"),
                PRICE_METRIC,
                1,
                1,
                t0 + 1800,
                t0 + 2400
            )
        );
        _attestDecision(
            "A",
            decisionSchema,
            _outcome(
                keccak256("f5-decision"),
                keccak256("f5-trigger"),
                PRICE_METRIC,
                1,
                1,
                finalTs + 7200,
                finalTs + 93600
            )
        );
        console2.log("SEED_F1_COMMITMENT");
        console2.logBytes32(f1Commitment);
    }

    function _phase2() private view {
        bytes32 settlementSchema = vm.envBytes32("SEED_SETTLEMENT_SCHEMA_UID");
        uint64 observedAt = uint64(vm.envUint("SEED_WINDOW_END"));
        int128 price = int128(vm.envInt("SEED_PRICE_VALUE"));
        int128 drawdown = int128(vm.envInt("SEED_DRAWDOWN_VALUE"));

        _attestSettlement(
            "A",
            settlementSchema,
            POICodec.SettlementData(
                vm.envBytes32("SEED_F1_UID"),
                0,
                true,
                price,
                "upbit:KRW-BTC:1m",
                observedAt,
                "poi-verifier/0.1.0",
                bytes32(0)
            )
        );
        _attestSettlement(
            "A",
            settlementSchema,
            POICodec.SettlementData(
                vm.envBytes32("SEED_F2_UID"),
                0,
                true,
                drawdown + 500,
                "upbit:KRW-BTC:1m",
                observedAt,
                "poi-verifier/0.1.0",
                bytes32(0)
            )
        );
    }

    function _phase3() private view {
        address eas = vm.envAddress("SEED_EAS_ADDRESS");
        bytes32 decisionSchema = vm.envBytes32("SEED_DECISION_SCHEMA_UID");
        bytes32 settlementSchema = vm.envBytes32("SEED_SETTLEMENT_SCHEMA_UID");
        bytes32 challengeSchema = vm.envBytes32("SEED_CHALLENGE_SCHEMA_UID");
        bytes32 f2S1 = vm.envBytes32("SEED_F2_SETTLEMENT_S1_UID");
        uint64 observedAt = uint64(vm.envUint("SEED_WINDOW_END"));
        int128 drawdown = int128(vm.envInt("SEED_DRAWDOWN_VALUE"));

        _tx(
            "A",
            eas,
            abi.encodeCall(
                IEAS.revoke,
                (
                    RevocationRequest({
                        schema: settlementSchema,
                        data: RevocationRequestData({uid: f2S1, value: 0})
                    })
                )
            )
        );
        _attestSettlement(
            "A",
            settlementSchema,
            POICodec.SettlementData(
                vm.envBytes32("SEED_F2_UID"),
                1,
                true,
                drawdown,
                "upbit:KRW-BTC:1m",
                observedAt,
                "poi-verifier/0.1.0",
                f2S1
            )
        );
        _attestChallenge(
            "B",
            challengeSchema,
            POICodec.ChallengeData(
                vm.envBytes32("SEED_F1_SETTLEMENT_UID"),
                1,
                true,
                int128(vm.envInt("SEED_PRICE_VALUE") - 1),
                "manual:seed-challenge",
                observedAt,
                keccak256("seed challenge note")
            )
        );

        POICodec.DecisionData memory copied;
        copied.parents = new bytes32[](0);
        copied.decisionCommitment = vm.envBytes32("SEED_F1_COMMITMENT");
        copied.triggerCommitment = keccak256("copy-trigger");
        _attestDecision("B", decisionSchema, copied);
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

    function _attestDecision(
        string memory actor,
        bytes32 schema,
        POICodec.DecisionData memory d
    ) private view {
        bytes32 refUID = d.parents.length == 0 ? bytes32(0) : d.parents[0];
        _attest(actor, schema, false, refUID, _decisionData(d));
    }

    function _attestSettlement(
        string memory actor,
        bytes32 schema,
        POICodec.SettlementData memory s
    ) private view {
        _attest(
            actor,
            schema,
            true,
            s.decisionUID,
            abi.encode(
                s.decisionUID,
                s.result,
                s.hasObservedValue,
                s.observedValue,
                s.source,
                s.observedAt,
                s.verifierVersion,
                s.supersedes
            )
        );
    }

    function _attestChallenge(
        string memory actor,
        bytes32 schema,
        POICodec.ChallengeData memory c
    ) private view {
        _attest(
            actor,
            schema,
            true,
            c.settlementUID,
            abi.encode(
                c.settlementUID,
                c.claimedResult,
                c.hasObservedValue,
                c.observedValue,
                c.source,
                c.observedAt,
                c.noteCommitment
            )
        );
    }

    function _attest(
        string memory actor,
        bytes32 schema,
        bool revocable,
        bytes32 refUID,
        bytes memory data
    ) private view {
        address eas = vm.envAddress("SEED_EAS_ADDRESS");
        _tx(
            actor,
            eas,
            abi.encodeCall(
                IEAS.attest,
                (
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
                )
            )
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

    function _tx(string memory actor, address to, bytes memory data) private pure {
        console2.log(
            string.concat("TX ", actor, " ", vm.toString(to), " ", vm.toString(data))
        );
    }
}
