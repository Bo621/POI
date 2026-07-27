// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {POIResolverBase} from "./POIResolverBase.sol";
import {POICodec} from "./POICodec.sol";

/// @title POINoteResolver — `poi.note.v1` (POI_TechSpec_v3.md §5.1, F3)
/// @notice C3. TIMESTAMPED_NOTE는 내용 commitment 하나만 온체인에 남긴다.
///
/// 노트는 **영구 기록**이다. 그래서 스키마 레벨과 attestation 레벨 두 곳 모두에서
/// 철회를 금지한다(§1.2) — 스키마만 막으면 attestation 레벨에서 뚫린다는 뜻이 아니라,
/// 그 반대다: 스키마가 `revocable=false`면 EAS가 철회를 막지만, 발행 시점의
/// `revocable` 플래그가 true인 attestation은 여전히 만들어질 수 있어 표시가 어긋난다.
contract POINoteResolver is POIResolverBase {
    error MustBeIrrevocable();
    error RefUIDMustBeZero();
    error MalformedPayload();

    /// @dev `poi.note.v1`은 `bytes32` 하나뿐이다.
    uint256 private constant NOTE_DATA_LENGTH = 32;

    constructor(IEAS eas) POIResolverBase(eas) {}

    function initialize(bytes32 noteSchemaUID) external {
        _initializeBase(noteSchemaUID);
    }

    function onAttest(Attestation calldata a, uint256) internal view override ready returns (bool) {
        _guard(a, schemaUID);

        if (a.revocable) revert MustBeIrrevocable();

        // EAS는 refUID·payload를 등록된 스키마에 대해 검증하지 않는다. 리졸버가 막지 않으면
        // 노트에 임의의 참조가 붙거나 잉여 워드가 실린 채로 온체인에 남고,
        // 인덱서·클라이언트마다 다르게 해석된다.
        if (a.refUID != 0) revert RefUIDMustBeZero(); // 노트는 독립 노드다 (§5.1)
        if (a.data.length != NOTE_DATA_LENGTH) revert MalformedPayload();

        if (POICodec.decodeNote(a.data) == 0) revert EmptyCommitment();

        return true;
    }

    /// @dev 스키마가 비철회이므로 EAS가 이 경로에 도달하기 전에 `Irrevocable()`로 막는다.
    function onRevoke(Attestation calldata, uint256) internal pure override returns (bool) {
        return true;
    }
}
