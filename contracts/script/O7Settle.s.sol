// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";

interface IEASSettle {
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

    struct RevocationRequestData {
        bytes32 uid;
        uint256 value;
    }

    struct RevocationRequest {
        bytes32 schema;
        RevocationRequestData data;
    }

    function attest(AttestationRequest calldata request) external payable returns (bytes32);
    function revoke(RevocationRequest calldata request) external payable;
}

/**
 * O7 2단계 — 결과 등록(정산)을 발행한다.
 *
 * 컨트랙트가 `result`를 관측값으로 다시 계산해 대조하므로(I17), 여기서 임의의 결과를
 * 넣을 수 없다. `O7_RESULT`가 틀리면 트랜잭션이 되돌아간다 — 그게 정상이다.
 *
 * `observedAt`은 반드시 `windowEnd`와 같아야 한다(I8).
 *
 * 정산은 revocable=true 여야 한다. 철회 후 재발행이 「철회 이력」 데모다.
 * 그때 `O7_SUPERSEDES`에 철회한 정산 UID를 넣는다.
 */
contract O7Settle is Script {
    function run() external {
        address eas = vm.envAddress("O7_EAS");
        bytes32 schema = vm.envBytes32("O7_SETTLEMENT_SCHEMA_UID");
        bytes32 decisionUID = vm.envBytes32("O7_DECISION_UID");
        uint8 result = uint8(vm.envUint("O7_RESULT"));
        int128 observedValue = int128(vm.envInt("O7_OBSERVED_VALUE"));
        uint64 observedAt = uint64(vm.envUint("O7_OBSERVED_AT"));
        string memory source = vm.envString("O7_SOURCE");
        string memory verifierVersion = vm.envString("O7_VERIFIER_VERSION");
        bytes32 supersedes = vm.envOr("O7_SUPERSEDES", bytes32(0));

        // 정규 인코딩은 유일해야 한다 — 리졸버가 디코딩 후 재인코딩해 바이트로 대조한다.
        bytes memory data = abi.encode(
            decisionUID, result, true, observedValue, source, observedAt, verifierVersion, supersedes
        );

        vm.startBroadcast();
        IEASSettle(eas).attest(
            IEASSettle.AttestationRequest({
                schema: schema,
                data: IEASSettle.AttestationRequestData({
                    recipient: address(0),
                    expirationTime: 0,
                    revocable: true,
                    refUID: decisionUID,
                    data: data,
                    value: 0
                })
            })
        );
        vm.stopBroadcast();

        console2.log("settled decision");
        console2.logBytes32(decisionUID);
        console2.log("result", result);
        console2.log("UID는 broadcast 영수증의 Attested 이벤트 data에서 읽을 것");
    }

    /// 철회만 한다. `O7_REVOKE_UID`에 철회할 정산 UID.
    function revokeOnly() external {
        address eas = vm.envAddress("O7_EAS");
        bytes32 schema = vm.envBytes32("O7_SETTLEMENT_SCHEMA_UID");
        bytes32 uid = vm.envBytes32("O7_REVOKE_UID");

        vm.startBroadcast();
        IEASSettle(eas).revoke(
            IEASSettle.RevocationRequest({
                schema: schema,
                data: IEASSettle.RevocationRequestData({uid: uid, value: 0})
            })
        );
        vm.stopBroadcast();

        console2.log("revoked");
        console2.logBytes32(uid);
    }
}
