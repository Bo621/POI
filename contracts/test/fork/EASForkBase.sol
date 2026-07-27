// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {
    IEAS,
    AttestationRequest,
    AttestationRequestData
} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {ISchemaRegistry} from "@ethereum-attestation-service/eas-contracts/contracts/ISchemaRegistry.sol";
import {ISchemaResolver} from "@ethereum-attestation-service/eas-contracts/contracts/resolver/ISchemaResolver.sol";

abstract contract EASForkBase is Test {
    address internal constant EAS_ADDR = 0x4200000000000000000000000000000000000021;
    address internal constant SCHEMA_REGISTRY_ADDR = 0x4200000000000000000000000000000000000020;
    uint256 internal constant FORK_BLOCK = 31_820_323;

    IEAS internal eas;
    ISchemaRegistry internal registry;
    bool internal forkAvailable;

    function _forkSetUp() internal {
        string memory rpc = vm.envOr("GIWA_SEPOLIA_RPC_URL", string("https://sepolia-rpc.giwa.io/"));
        try vm.createSelectFork(rpc, FORK_BLOCK) {
            forkAvailable = true;
        } catch {
            forkAvailable = false;
            vm.skip(true);
            return;
        }

        eas = IEAS(EAS_ADDR);
        registry = ISchemaRegistry(SCHEMA_REGISTRY_ADDR);
        assertEq(block.chainid, 91342);
    }

    function _registerSchema(string memory schema, address resolver, bool revocable) internal returns (bytes32) {
        return registry.register(schema, ISchemaResolver(resolver), revocable);
    }

    function _attest(bytes32 schemaUID, address attester, bool revocable, bytes32 refUID, bytes memory data)
        internal
        returns (bytes32)
    {
        vm.prank(attester);
        return eas.attest(
            AttestationRequest({
                schema: schemaUID,
                data: AttestationRequestData({
                    recipient: address(0), expirationTime: 0, revocable: revocable, refUID: refUID, data: data, value: 0
                })
            })
        );
    }
}
