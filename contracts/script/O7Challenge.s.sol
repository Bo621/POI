// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";

interface IEASChallenge {
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
 * O7 3단계 — 정산에 이의를 건다.
 *
 * 이의는 `settlementUID`를 참조한다(결정이 아니다). `refUID`도 같아야 한다.
 * 한 attester는 한 정산에 하나의 활성 이의만 가질 수 있다.
 *
 * **데모 한계.** 지금 자금이 있는 지갑이 하나라 정산자와 이의자가 같은 주소다.
 * 컨트랙트는 이를 막지 않지만, 「제3자 이의」라는 서사는 약해진다.
 * 화면에는 이의자 주소가 그대로 표시되므로 심사자가 알 수 있다.
 */
contract O7Challenge is Script {
    function run() external {
        address eas = vm.envAddress("O7_EAS");
        bytes32 schema = vm.envBytes32("O7_CHALLENGE_SCHEMA_UID");
        bytes32 settlementUID = vm.envBytes32("O7_SETTLEMENT_UID");
        uint8 claimedResult = uint8(vm.envUint("O7_CLAIMED_RESULT"));
        int128 observedValue = int128(vm.envInt("O7_CLAIMED_VALUE"));
        uint64 observedAt = uint64(vm.envUint("O7_OBSERVED_AT"));
        string memory source = vm.envString("O7_CLAIM_SOURCE");

        bytes memory data = abi.encode(
            settlementUID, claimedResult, true, observedValue, source, observedAt, bytes32(0)
        );

        vm.startBroadcast();
        IEASChallenge(eas).attest(
            IEASChallenge.AttestationRequest({
                schema: schema,
                data: IEASChallenge.AttestationRequestData({
                    recipient: address(0),
                    expirationTime: 0,
                    revocable: true,
                    refUID: settlementUID,
                    data: data,
                    value: 0
                })
            })
        );
        vm.stopBroadcast();

        console2.log("challenged settlement");
        console2.logBytes32(settlementUID);
    }
}
