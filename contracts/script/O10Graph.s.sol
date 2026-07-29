// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {POICodec} from "../src/POICodec.sol";

interface IEASAttest {
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
 * O10 — 노트 → 결정 승격 · Decision Graph fixture.
 *
 * 「판단이 이어진다」가 이 제품의 서사인데 화면에서 볼 수 있는 fixture 가 없었다.
 * 구현·배포는 돼 있었지만 심사자가 확인할 방법이 없으면 없는 것과 같다.
 *
 * 만드는 것:
 *   1. 노트 1건            — 시점만 고정, 검증되지 않는 기록
 *   2. 부모 결정           — 그 노트에서 승격 (`promotedFromNote`)
 *   3. 자식 결정           — 부모를 `parents[0]` 로 참조 (`refUID` 도 같아야 한다, I12)
 *
 * **I2**: 부모 시각이 자식보다 **엄격히** 빨라야 한다. 그래서 순서대로 발행한다.
 * **UID 는 broadcast 영수증에서 읽는다** — 시뮬레이션 값은 블록 시각이 달라 틀린다.
 */
contract O10Graph is Script {
    bytes32 internal constant NOTE_TAG = keccak256("poi.commit.note.v1");
    bytes32 internal constant DECISION_TAG = keccak256("poi.commit.decision.v1");

    function run() external {
        address eas = vm.envAddress("O10_EAS");
        bytes32 noteSchema = vm.envBytes32("O10_NOTE_SCHEMA_UID");
        bytes32 decisionSchema = vm.envBytes32("O10_DECISION_SCHEMA_UID");
        bytes32 metricId = vm.envBytes32("O10_METRIC_ID");
        address attester = vm.envAddress("O10_ATTESTER");
        bytes32 verified = vm.envOr("POI_VERIFIED_ADDRESS_UID", bytes32(0));
        bytes32 parentUID = vm.envOr("O10_PARENT_UID", bytes32(0));
        bytes32 noteUID = vm.envOr("O10_NOTE_UID", bytes32(0));

        uint64 windowStart = uint64(block.timestamp) + 300;
        uint64 windowEnd = windowStart + 600;

        vm.startBroadcast();
        if (noteUID == bytes32(0)) {
            // 1단계 — 노트만 발행한다. UID 를 읽어 2단계에 넘긴다.
            _note(eas, noteSchema, attester);
        } else if (parentUID == bytes32(0)) {
            // 2단계 — 노트에서 승격한 부모 결정.
            _decision(
                eas, decisionSchema, metricId, attester, verified,
                bytes16(0x0a0b0c0d0e0f01020304050607080900), "O10-parent",
                noteUID, bytes32(0), windowStart, windowEnd
            );
        } else {
            // 3단계 — 부모를 잇는 자식 결정. refUID 는 parents[0] 와 같아야 한다(I12).
            _decision(
                eas, decisionSchema, metricId, attester, verified,
                bytes16(0x1a1b1c1d1e1f11121314151617181910), "O10-child",
                bytes32(0), parentUID, windowStart, windowEnd
            );
        }
        vm.stopBroadcast();
        console2.log("windowStart", windowStart);
        console2.log("windowEnd", windowEnd);
    }

    function _note(address eas, bytes32 schema, address attester) private {
        bytes16 salt = bytes16(0x2a2b2c2d2e2f21222324252627282920);
        bytes32 commitment = keccak256(
            abi.encodePacked(NOTE_TAG, bytes32(block.chainid), attester, salt, bytes("O10-note"))
        );
        IEASAttest(eas).attest(
            IEASAttest.AttestationRequest({
                schema: schema,
                data: IEASAttest.AttestationRequestData({
                    recipient: address(0), expirationTime: 0, revocable: false,
                    refUID: bytes32(0), data: abi.encode(commitment), value: 0
                })
            })
        );
        console2.log("note commitment");
        console2.logBytes32(commitment);
    }

    function _decision(
        address eas, bytes32 schema, bytes32 metricId, address attester, bytes32 verified,
        bytes16 salt, string memory payload, bytes32 fromNote, bytes32 parent,
        uint64 windowStart, uint64 windowEnd
    ) private {
        POICodec.DecisionData memory d;
        if (parent == bytes32(0)) {
            d.parents = new bytes32[](0);
        } else {
            d.parents = new bytes32[](1);
            d.parents[0] = parent;
        }
        d.promotedFromNote = fromNote;
        d.verifiedAddressUID = verified;
        d.decisionCommitment = keccak256(
            abi.encodePacked(DECISION_TAG, bytes32(block.chainid), attester, salt, bytes(payload))
        );
        d.triggerCommitment = keccak256(abi.encodePacked("o10-trigger", salt));
        d.hasExpectedOutcome = true;
        d.outcomeMetricId = metricId;
        d.outcomeOp = 0;
        d.outcomeThreshold = 1;
        d.windowStart = windowStart;
        d.windowEnd = windowEnd;
        d.graceSeconds = 1 hours;

        IEASAttest(eas).attest(
            IEASAttest.AttestationRequest({
                schema: schema,
                data: IEASAttest.AttestationRequestData({
                    recipient: address(0), expirationTime: 0, revocable: false,
                    refUID: parent, data: _decisionData(d), value: 0
                })
            })
        );
        console2.log("decision commitment");
        console2.logBytes32(d.decisionCommitment);
    }

    /// 평탄 튜플 인코딩 — 앞의 오프셋 워드가 핵심이다 (O7Commit 과 같다).
    function _decisionData(POICodec.DecisionData memory d) private pure returns (bytes memory) {
        bytes memory wrappedParents = abi.encode(d.parents);
        bytes memory parents;
        assembly ("memory-safe") {
            parents := add(wrappedParents, 0x20)
            mstore(parents, sub(mload(wrappedParents), 0x20))
        }
        return bytes.concat(
            abi.encode(
                uint256(14 * 32), d.promotedFromNote, d.verifiedAddressUID, d.decisionCommitment,
                d.triggerCommitment, d.evidenceCommitment, d.reasonCommitment
            ),
            abi.encode(
                d.hasExpectedOutcome, d.outcomeMetricId, d.outcomeOp, d.outcomeThreshold,
                d.windowStart, d.windowEnd, d.graceSeconds
            ),
            parents
        );
    }
}
