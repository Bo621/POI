// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title POICodec — EAS attestation 데이터 디코딩 (POI_TechSpec_v3.md §6.1)
/// @notice C1. 여기서 막히면 리졸버 전체가 정지한다.
///
/// EAS의 `attestation.data`는 `SchemaEncoder`가 만든 **평면 튜플 인코딩**이다.
/// 즉 `abi.encode(field1, field2, ...)` 형태로, 스키마 필드가 나란히 놓인다.
///
/// 반면 `abi.decode(data, (D))`는 **단일 동적 구조체** 인코딩을 기대한다.
/// 동적 멤버가 하나라도 있으면 그 인코딩은 맨 앞에 "구조체 본문 offset" 워드가 붙는다.
/// 그래서 평면 튜플을 그대로 넣으면 첫 필드를 offset으로 오독하고 revert한다.
///
/// 해법은 그 offset 워드(0x20)를 앞에 붙여 단일 동적 튜플 인코딩으로 만드는 것이다.
/// 두 인코딩은 그 한 워드를 빼면 동일하다.
///
///   평면 튜플         [ parents_offset ][ promotedFromNote ][ ... ][ parents 본문 ]
///   단일 동적 튜플    [ 0x20 ][ parents_offset ][ promotedFromNote ][ ... ][ parents 본문 ]
///                      ^^^^ 이 한 워드만 붙이면 된다
///
/// 정적 필드만 있는 스키마(NOTE)는 두 인코딩이 같으므로 트릭이 필요 없다.
library POICodec {
    /// @dev 단일 동적 튜플 인코딩으로 만드는 offset 워드. 위 주석을 지우지 말 것.
    bytes32 private constant STRUCT_BODY_OFFSET = bytes32(uint256(0x20));

    /// @notice `poi.decision.v1` (§5.2). 필드 순서는 스키마 문자열과 **정확히** 같아야 한다.
    struct DecisionData {
        bytes32[] parents;
        bytes32 promotedFromNote;
        bytes32 verifiedAddressUID;
        bytes32 decisionCommitment;
        bytes32 triggerCommitment;
        bytes32 evidenceCommitment;
        bytes32 reasonCommitment;
        bool hasExpectedOutcome;
        bytes32 outcomeMetricId;
        uint8 outcomeOp;
        int128 outcomeThreshold;
        uint64 windowStart;
        uint64 windowEnd;
        uint32 graceSeconds;
    }

    /// @notice `poi.settlement.v1` (§5.3).
    struct SettlementData {
        bytes32 decisionUID;
        uint8 result;
        bool hasObservedValue;
        int128 observedValue;
        string source;
        uint64 observedAt;
        string verifierVersion;
        bytes32 supersedes;
    }

    /// @notice `poi.challenge.v1` (§5.4).
    struct ChallengeData {
        bytes32 settlementUID;
        uint8 claimedResult;
        bool hasObservedValue;
        int128 observedValue;
        string source;
        uint64 observedAt;
        bytes32 noteCommitment;
    }

    /// @dev `bytes memory`인 이유: 정산 리졸버가 `getAttestation`으로 읽어 온 결정 데이터를
    ///      디코딩해야 하는데 그것은 memory다. `bytes.concat`이 어차피 복사하므로 손해가 없다.
    function decodeDecision(bytes memory data) internal pure returns (DecisionData memory) {
        return abi.decode(bytes.concat(STRUCT_BODY_OFFSET, data), (DecisionData));
    }

    function decodeSettlement(bytes calldata data) internal pure returns (SettlementData memory) {
        return abi.decode(bytes.concat(STRUCT_BODY_OFFSET, data), (SettlementData));
    }

    function decodeChallenge(bytes calldata data) internal pure returns (ChallengeData memory) {
        return abi.decode(bytes.concat(STRUCT_BODY_OFFSET, data), (ChallengeData));
    }

    /// @notice `poi.note.v1` (§5.1) — `bytes32` 하나뿐이라 평면 튜플과 구조체 인코딩이 동일하다.
    function decodeNote(bytes calldata data) internal pure returns (bytes32 contentCommitment) {
        return abi.decode(data, (bytes32));
    }
}
