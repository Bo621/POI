// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {IEAS} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {ISchemaRegistry} from "@ethereum-attestation-service/eas-contracts/contracts/ISchemaRegistry.sol";
import {ISchemaResolver} from "@ethereum-attestation-service/eas-contracts/contracts/resolver/ISchemaResolver.sol";
import {POINoteResolver} from "../src/POINoteResolver.sol";
import {POIDecisionResolver} from "../src/POIDecisionResolver.sol";
import {POISettlementResolver} from "../src/POISettlementResolver.sol";
import {POIChallengeResolver} from "../src/POIChallengeResolver.sol";

contract Deploy is Script {
    address internal constant DEFAULT_EAS = 0x4200000000000000000000000000000000000021;
    address internal constant DEFAULT_SCHEMA_REGISTRY = 0x4200000000000000000000000000000000000020;

    struct Deployment {
        address note;
        address decision;
        address settlement;
        address challenge;
        bytes32 noteSchemaUID;
        bytes32 decisionSchemaUID;
        bytes32 settlementSchemaUID;
        bytes32 challengeSchemaUID;
    }

    /// forge script entrypoint. Opens the broadcast section.
    function run() external returns (Deployment memory d) {
        vm.startBroadcast();
        d = _deploy();
        vm.stopBroadcast();
        _log(d);
    }

    /// Test entrypoint that deploys without broadcasting.
    function deployForTest() external returns (Deployment memory) {
        return _deploy();
    }

    function _deploy() internal returns (Deployment memory d) {
        IEAS eas = IEAS(vm.envOr("EAS", DEFAULT_EAS));
        ISchemaRegistry registry = ISchemaRegistry(vm.envOr("SCHEMA_REGISTRY", DEFAULT_SCHEMA_REGISTRY));

        POINoteResolver note = new POINoteResolver(eas);
        POIDecisionResolver decision = new POIDecisionResolver(eas);
        POISettlementResolver settlement = new POISettlementResolver(eas);
        POIChallengeResolver challenge = new POIChallengeResolver(eas);

        d.note = address(note);
        d.decision = address(decision);
        d.settlement = address(settlement);
        d.challenge = address(challenge);

        d.noteSchemaUID = registry.register("bytes32 contentCommitment", ISchemaResolver(address(note)), false);
        require(d.noteSchemaUID != bytes32(0), "note schema UID is zero");

        d.decisionSchemaUID = registry.register(
            "bytes32[] parents,bytes32 promotedFromNote,bytes32 verifiedAddressUID,bytes32 decisionCommitment,bytes32 triggerCommitment,bytes32 evidenceCommitment,bytes32 reasonCommitment,bool hasExpectedOutcome,bytes32 outcomeMetricId,uint8 outcomeOp,int128 outcomeThreshold,uint64 windowStart,uint64 windowEnd,uint32 graceSeconds",
            ISchemaResolver(address(decision)),
            false
        );
        require(d.decisionSchemaUID != bytes32(0), "decision schema UID is zero");

        d.settlementSchemaUID = registry.register(
            "bytes32 decisionUID,uint8 result,bool hasObservedValue,int128 observedValue,string source,uint64 observedAt,string verifierVersion,bytes32 supersedes",
            ISchemaResolver(address(settlement)),
            true
        );
        require(d.settlementSchemaUID != bytes32(0), "settlement schema UID is zero");

        d.challengeSchemaUID = registry.register(
            "bytes32 settlementUID,uint8 claimedResult,bool hasObservedValue,int128 observedValue,string source,uint64 observedAt,bytes32 noteCommitment",
            ISchemaResolver(address(challenge)),
            true
        );
        require(d.challengeSchemaUID != bytes32(0), "challenge schema UID is zero");

        note.initialize(d.noteSchemaUID);
        require(note.initialized(), "note not initialized");
        decision.initialize(d.decisionSchemaUID, d.noteSchemaUID);
        require(decision.initialized(), "decision not initialized");
        settlement.initialize(d.settlementSchemaUID, d.decisionSchemaUID);
        require(settlement.initialized(), "settlement not initialized");
        challenge.initialize(d.challengeSchemaUID, d.settlementSchemaUID);
        require(challenge.initialized(), "challenge not initialized");
    }

    function _log(Deployment memory d) internal pure {
        console2.log("POINoteResolver:", d.note);
        console2.log("POIDecisionResolver:", d.decision);
        console2.log("POISettlementResolver:", d.settlement);
        console2.log("POIChallengeResolver:", d.challenge);
        console2.log("poi.note.v1 schema UID:");
        console2.logBytes32(d.noteSchemaUID);
        console2.log("poi.decision.v1 schema UID:");
        console2.logBytes32(d.decisionSchemaUID);
        console2.log("poi.settlement.v1 schema UID:");
        console2.logBytes32(d.settlementSchemaUID);
        console2.log("poi.challenge.v1 schema UID:");
        console2.logBytes32(d.challengeSchemaUID);
        console2.log(unicode"남은 단계 (스크립트가 하지 않는다):");
        console2.log(unicode"  7. addMetric x N  — V3 지표 정의 문서가 있어야 한다 (definitionHash != 0)");
        console2.log(unicode"  8. transferOwnership -> multisig, acceptOwnership. renounce 하지 않는다 (B13)");
    }
}
