// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SchemaResolver} from "@ethereum-attestation-service/eas-contracts/contracts/resolver/SchemaResolver.sol";
import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title POIResolverBase — 모든 POI 리졸버의 공통 가드 (POI_TechSpec_v3.md §6.2, B5)
/// @notice C2. v2.1은 부모의 `expirationTime`만 검사하고 자기 자신은 검사하지 않았다.
///
/// 배포 순서상 스키마 UID는 생성자에서 알 수 없다 — 스키마 등록에 리졸버 주소가 필요하고
/// 리졸버는 스키마 UID를 알아야 하는 순환이다(§6.6). 그래서 `immutable`이 원리적으로 불가능하고,
/// 대신 `initialize()` + `ready` 가드로 **1~6 사이의 창**을 막는다.
/// 이 가드가 없으면 스키마 UID가 0인 상태로 검증 없는 attestation이 발행된다.
abstract contract POIResolverBase is SchemaResolver, Ownable2Step {
    /// @notice `initialize()` 완료 여부. false인 동안 모든 발행이 revert한다.
    bool public initialized;

    /// @notice 이 리졸버가 담당하는 스키마 UID.
    bytes32 public schemaUID;

    error NotInitialized();
    error AlreadyInitialized();
    error MustBePermanent();
    error WrongSchema();
    error EmptyCommitment();
    error RecipientMustBeZero();
    error ZeroSchemaUID();
    error RenounceDisabled();

    event Initialized(bytes32 indexed schemaUID);

    modifier ready() {
        if (!initialized) revert NotInitialized();
        _;
    }

    constructor(IEAS eas) SchemaResolver(eas) Ownable(msg.sender) {}

    /// @notice 담당 스키마 UID를 한 번만 설정한다. 파생 리졸버는 필요한 UID를 더 받도록 확장한다.
    /// @dev 재초기화를 막는 이유: 이미 발행된 attestation의 검증 전제가 소급 변경되기 때문이다.
    function initialize(bytes32 ownSchemaUID) public virtual onlyOwner {
        if (initialized) revert AlreadyInitialized();
        if (ownSchemaUID == 0) revert ZeroSchemaUID();
        schemaUID = ownSchemaUID;
        initialized = true;
        emit Initialized(ownSchemaUID);
    }

    /// @notice 모든 POI attestation에 공통 적용되는 가드.
    /// @dev `expirationTime != 0` 금지가 핵심이다(B5·V10) — "영구 기록"을 주장하려면
    ///      만료를 허용해서는 안 된다. 스키마 일치 검사는 리졸버가 다른 스키마에
    ///      재사용되는 것을 막는다. `recipient`는 POI에 수취인 개념이 없어 0으로 고정한다.
    function _guard(Attestation calldata a, bytes32 expectedSchema) internal pure {
        if (a.schema != expectedSchema) revert WrongSchema();
        if (a.expirationTime != 0) revert MustBePermanent();
        if (a.recipient != address(0)) revert RecipientMustBeZero();
    }

    /// @dev POI 리졸버는 값을 받지 않는다.
    function isPayable() public pure override returns (bool) {
        return false;
    }

    /// @notice 소유권 포기를 **구조적으로 막는다** (B13).
    /// @dev 명세는 "renounce 하지 않는다"를 절차로 두지만, 절차는 실수로 깨진다.
    ///      소유자가 사라지면 Phase 1에서 지표를 추가할 수 없고 되돌릴 방법도 없다.
    ///      소유권 이전(multisig)은 `transferOwnership` + `acceptOwnership`으로 계속 가능하다.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }
}
