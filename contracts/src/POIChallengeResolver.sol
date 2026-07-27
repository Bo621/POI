// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {POIResolverBase} from "./POIResolverBase.sol";
import {POICodec} from "./POICodec.sol";

/// @title POIChallengeResolver — `poi.challenge.v1` (POI_TechSpec_v3.md §5.4, §6.5, B8, I15)
/// @notice C6. 정산별·발행자별 활성 이의를 하나로 제한하고, 철회 뒤 재발행을 허용한다.
contract POIChallengeResolver is POIResolverBase {
    bytes32 public settlementSchemaUID;

    /// @notice 정산별·발행자별 활성 이의. 철회되면 0으로 돌아가 재발행할 수 있다.
    mapping(bytes32 settlementUID => mapping(address challenger => bytes32 challengeUID)) public activeChallenge;

    error MustBeRevocable();
    error MalformedPayload();
    error RefUIDMismatch();
    error ResultOutOfRange();
    error SettlementNotFound();
    error SettlementWrongSchema();
    error SettlementRevoked();
    error AlreadyChallenged();

    constructor(IEAS eas) POIResolverBase(eas) {}

    /// @dev 필요한 UID를 한 번에 받아 부분 초기화 상태를 만들 수 없게 한다.
    function initialize(bytes32 challengeSchemaUID, bytes32 settlementSchema) external {
        _requireNonZeroUID(settlementSchema);
        settlementSchemaUID = settlementSchema;
        _initializeBase(challengeSchemaUID);
    }

    function onAttest(Attestation calldata a, uint256) internal override ready returns (bool) {
        _guard(a, schemaUID);

        // 이의는 잘못된 관측을 바로잡을 수 있어야 하므로 영구적으로 철회 불가능하면 안 된다.
        if (!a.revocable) revert MustBeRevocable();

        POICodec.ChallengeData memory c = POICodec.decodeChallenge(a.data);
        _requireCanonicalPayload(a.data, c);

        if (a.refUID != c.settlementUID) revert RefUIDMismatch();
        if (c.claimedResult > 2) revert ResultOutOfRange();

        Attestation memory settlement = _eas.getAttestation(c.settlementUID);
        if (settlement.uid == 0) revert SettlementNotFound();
        if (settlement.schema != settlementSchemaUID) revert SettlementWrongSchema();
        if (settlement.revocationTime != 0) revert SettlementRevoked();
        if (activeChallenge[c.settlementUID][a.attester] != 0) revert AlreadyChallenged();

        activeChallenge[c.settlementUID][a.attester] = a.uid;
        return true;
    }

    /// @dev EAS는 스키마 인코딩을 검증하지 않고 `abi.decode`는 잉여 바이트를 무시한다.
    ///      재인코딩한 유일한 정규 표현과 비교해 비정규 payload가 영구 기록되는 것을 막는다.
    function _requireCanonicalPayload(bytes calldata data, POICodec.ChallengeData memory c) private pure {
        bytes memory canonical = abi.encode(
            c.settlementUID,
            c.claimedResult,
            c.hasObservedValue,
            c.observedValue,
            c.source,
            c.observedAt,
            c.noteCommitment
        );
        if (keccak256(data) != keccak256(canonical)) revert MalformedPayload();
    }

    /// @dev 현재 활성 UID와 일치할 때만 비워야 뒤늦은 중복 철회가 새 이의를 지우지 않는다.
    function onRevoke(Attestation calldata a, uint256) internal override returns (bool) {
        POICodec.ChallengeData memory c = POICodec.decodeChallenge(a.data);
        if (activeChallenge[c.settlementUID][a.attester] == a.uid) {
            activeChallenge[c.settlementUID][a.attester] = 0;
        }
        return true;
    }
}
