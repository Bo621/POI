// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SchemaRecord} from "@ethereum-attestation-service/eas-contracts/contracts/ISchemaRegistry.sol";
import {Deploy} from "../../script/Deploy.s.sol";
import {EASForkBase} from "./EASForkBase.sol";
import {POINoteResolver} from "../../src/POINoteResolver.sol";
import {POIDecisionResolver} from "../../src/POIDecisionResolver.sol";
import {POISettlementResolver} from "../../src/POISettlementResolver.sol";
import {POIChallengeResolver} from "../../src/POIChallengeResolver.sol";

contract DeployForkTest is EASForkBase {
    Deploy internal deploy;
    Deploy.Deployment internal deployment;
    POINoteResolver internal note;
    POIDecisionResolver internal decision;
    POISettlementResolver internal settlement;
    POIChallengeResolver internal challenge;

    function setUp() public {
        _forkSetUp();
        if (!forkAvailable) return;

        deploy = new Deploy();
        deployment = deploy.deployForTest();
        note = POINoteResolver(payable(deployment.note));
        decision = POIDecisionResolver(payable(deployment.decision));
        settlement = POISettlementResolver(payable(deployment.settlement));
        challenge = POIChallengeResolver(payable(deployment.challenge));
    }

    function test_Fork_Deploy_AllResolversReady() public view {
        assertTrue(note.initialized());
        assertTrue(decision.initialized());
        assertTrue(settlement.initialized());
        assertTrue(challenge.initialized());
        assertEq(note.schemaUID(), deployment.noteSchemaUID);
        assertEq(decision.schemaUID(), deployment.decisionSchemaUID);
        assertEq(settlement.schemaUID(), deployment.settlementSchemaUID);
        assertEq(challenge.schemaUID(), deployment.challengeSchemaUID);
    }

    function test_Fork_Deploy_SchemaRevocabilityMatchesSpec() public view {
        assertFalse(registry.getSchema(deployment.noteSchemaUID).revocable);
        assertFalse(registry.getSchema(deployment.decisionSchemaUID).revocable);
        assertTrue(registry.getSchema(deployment.settlementSchemaUID).revocable);
        assertTrue(registry.getSchema(deployment.challengeSchemaUID).revocable);
    }

    function test_Fork_Deploy_SchemaResolverBinding() public view {
        SchemaRecord memory noteSchema = registry.getSchema(deployment.noteSchemaUID);
        SchemaRecord memory decisionSchema = registry.getSchema(deployment.decisionSchemaUID);
        SchemaRecord memory settlementSchema = registry.getSchema(deployment.settlementSchemaUID);
        SchemaRecord memory challengeSchema = registry.getSchema(deployment.challengeSchemaUID);

        assertEq(address(noteSchema.resolver), deployment.note);
        assertEq(address(decisionSchema.resolver), deployment.decision);
        assertEq(address(settlementSchema.resolver), deployment.settlement);
        assertEq(address(challengeSchema.resolver), deployment.challenge);
    }

    function test_Fork_Deploy_CrossReferencesWired() public view {
        assertEq(decision.noteSchemaUID(), deployment.noteSchemaUID);
        assertEq(settlement.decisionSchemaUID(), deployment.decisionSchemaUID);
        assertEq(challenge.settlementSchemaUID(), deployment.settlementSchemaUID);
    }

    function test_Fork_Deploy_OwnerIsDeployer() public view {
        assertEq(note.owner(), address(deploy));
        assertEq(decision.owner(), address(deploy));
        assertEq(settlement.owner(), address(deploy));
        assertEq(challenge.owner(), address(deploy));
    }

    function test_Fork_Deploy_AttestWorksAfterDeploy() public {
        bytes32 uid = _attest(
            deployment.noteSchemaUID, address(0xA11CE), false, bytes32(0), abi.encode(keccak256("deployed note"))
        );

        assertNotEq(uid, bytes32(0));
        assertEq(eas.getAttestation(uid).schema, deployment.noteSchemaUID);
    }

    function test_Fork_Deploy_NoMetricsRegistered() public view {
        (bool allowed,,,,) = decision.metrics(keccak256("BTC_30D_REALIZED_VOL_AT_END"));
        assertFalse(allowed);
    }
}
