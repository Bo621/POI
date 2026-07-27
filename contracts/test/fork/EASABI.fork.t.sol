// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {
    IEAS,
    Attestation,
    RevocationRequest,
    RevocationRequestData
} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {SchemaRecord} from "@ethereum-attestation-service/eas-contracts/contracts/ISchemaRegistry.sol";
import {POINoteResolver} from "../../src/POINoteResolver.sol";
import {POIResolverBase} from "../../src/POIResolverBase.sol";
import {EASForkBase} from "./EASForkBase.sol";

contract EASABIForkTest is EASForkBase {
    address internal constant ATTESTER = address(0xA11CE);

    function setUp() public {
        _forkSetUp();
    }

    function test_Fork_EASVersion() public view {
        assertEq(IEAS(EAS_ADDR).version(), "1.4.1-beta.3");
    }

    function test_Fork_SchemaRegistryAddress() public view {
        assertEq(address(eas.getSchemaRegistry()), SCHEMA_REGISTRY_ADDR);
    }

    function test_Fork_GetAttestationOnUnknownUID() public view {
        Attestation memory attestation = eas.getAttestation(keccak256("unknown attestation"));
        assertEq(attestation.uid, bytes32(0));
    }

    function test_Fork_RegisterSchemaRoundTrip() public {
        string memory schema = "bytes32 c8Registration";
        bytes32 uid = _registerSchema(schema, address(0), true);
        SchemaRecord memory record = registry.getSchema(uid);

        assertEq(record.uid, uid);
        assertEq(record.schema, schema);
        assertTrue(record.revocable);
    }

    function test_Fork_AttestAndReadBack() public {
        bytes32 schemaUID = _registerSchema("bytes32 c8Attestation", address(0), true);
        bytes32 refUID = bytes32(0);
        bytes memory data = abi.encode(keccak256("c8 payload"));
        bytes32 uid = _attest(schemaUID, ATTESTER, true, refUID, data);
        Attestation memory attestation = eas.getAttestation(uid);

        assertEq(attestation.uid, uid);
        assertEq(attestation.schema, schemaUID);
        assertEq(attestation.attester, ATTESTER);
        assertEq(attestation.recipient, address(0));
        assertEq(attestation.expirationTime, 0);
        assertTrue(attestation.revocable);
        assertEq(attestation.refUID, refUID);
        assertEq(attestation.data, data);
        assertNotEq(attestation.time, 0);
        assertEq(attestation.revocationTime, 0);
    }

    function test_Fork_AttestWithRefUIDReadBack() public {
        bytes32 schemaUID = _registerSchema("bytes32 c8RefAttestation", address(0), true);
        bytes32 parentUID = _attest(schemaUID, ATTESTER, true, bytes32(0), abi.encode(keccak256("c8 parent payload")));
        bytes32 childUID = _attest(schemaUID, ATTESTER, true, parentUID, abi.encode(keccak256("c8 child payload")));

        assertEq(eas.getAttestation(childUID).refUID, parentUID);
    }

    function test_Fork_RevokeAndReadBack() public {
        bytes32 schemaUID = _registerSchema("bytes32 c8Revocation", address(0), true);
        bytes32 uid = _attest(schemaUID, ATTESTER, true, bytes32(0), abi.encode(keccak256("revocable")));

        vm.prank(ATTESTER);
        eas.revoke(RevocationRequest({schema: schemaUID, data: RevocationRequestData({uid: uid, value: 0})}));

        assertNotEq(eas.getAttestation(uid).revocationTime, 0);
    }

    function test_Fork_ResolverIsCalledOnAttest() public {
        POINoteResolver resolver = new POINoteResolver(eas);
        bytes32 schemaUID = _registerSchema("bytes32 contentCommitment", address(resolver), false);
        resolver.initialize(schemaUID);

        _attest(schemaUID, ATTESTER, false, bytes32(0), abi.encode(keccak256("content")));

        vm.expectRevert(POIResolverBase.EmptyCommitment.selector);
        _attest(schemaUID, ATTESTER, false, bytes32(0), abi.encode(bytes32(0)));
    }

    function test_Fork_EASIsUpgradeableProxy() public view {
        bytes32 implementationSlot =
            vm.load(EAS_ADDR, 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc);
        address implementation = address(uint160(uint256(implementationSlot)));

        assertTrue(implementation != address(0));

        // The EAS predeploy is upgradeable. Resolver invariants depend on the current
        // implementation, so an implementation change should make this test fail first.
        bytes memory implementationCode = implementation.code;
        assertTrue(_containsSelector(implementationCode, IEAS.attest.selector));
        assertTrue(_containsSelector(implementationCode, IEAS.revoke.selector));
        assertTrue(_containsSelector(implementationCode, IEAS.getAttestation.selector));

        bytes memory proxyCode = EAS_ADDR.code;
        assertFalse(_containsSelector(proxyCode, IEAS.attest.selector));
        assertFalse(_containsSelector(proxyCode, IEAS.revoke.selector));
        assertFalse(_containsSelector(proxyCode, IEAS.getAttestation.selector));
    }

    function _containsSelector(bytes memory code, bytes4 selector) internal pure returns (bool) {
        if (code.length < 4) return false;

        for (uint256 i = 0; i <= code.length - 4; ++i) {
            bool matches = true;
            for (uint256 j = 0; j < 4; ++j) {
                if (code[i + j] != selector[j]) {
                    matches = false;
                    break;
                }
            }
            if (matches) return true;
        }

        return false;
    }
}
