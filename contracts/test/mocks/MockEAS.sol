// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";

/// @dev 리졸버가 쓰는 `getAttestation`만 흉내낸다.
///      실제 EAS(1.4.1-beta.3) 상대 검증은 포크 통합 테스트가 맡는다 — 목은 목일 뿐이다.
contract MockEAS {
    mapping(bytes32 uid => Attestation) private _attestations;

    function set(Attestation memory a) external {
        _attestations[a.uid] = a;
    }

    function getAttestation(bytes32 uid) external view returns (Attestation memory) {
        return _attestations[uid];
    }
}
