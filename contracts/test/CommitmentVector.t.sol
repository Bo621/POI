// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

/// @notice X1 — commitment 고정 벡터 대조 (POI_TechSpec_v3.md §4.3 / E1).
///
/// TS(core/)와 **같은 파일**을 읽는다. 벡터를 각자 들고 있으면 언젠가 조용히 어긋난다(B3).
/// 기대값은 이 컨트랙트도 TS도 아닌 `cast keccak`으로 만들었다 — 자기검증 순환을 피하기 위해서다.
///
///   C = keccak256( TAG(32) ‖ chainId(uint256 BE) ‖ attester(20) ‖ salt(16) ‖ utf8(JCS(payload)) )
contract CommitmentVectorTest is Test {
    using stdJson for string;

    string internal json;
    uint256 internal caseCount;

    function setUp() public {
        json = vm.readFile("../core/vectors/commitment.v1.json");
        // forge의 JSON 경로는 `[*]` 집계를 지원하지 않는다. 생성기가 개수를 함께 기록한다.
        caseCount = json.readUint(".caseCount");
        assertGt(caseCount, 0, "vector file empty");
    }

    function _path(uint256 i, string memory field) internal pure returns (string memory) {
        return string.concat(".cases[", vm.toString(i), "].", field);
    }

    /// @dev 태그 상수가 도메인 문자열의 keccak과 일치하는지 — 오타가 조용히 통과하지 않도록.
    function test_CommitmentVector_Tags() public view {
        assertEq(json.readBytes32(".tags.DECISION.tag"), keccak256(bytes("poi.commit.decision.v1")));
        assertEq(json.readBytes32(".tags.TRIGGER.tag"), keccak256(bytes("poi.commit.trigger.v1")));
        assertEq(json.readBytes32(".tags.EVIDENCE.tag"), keccak256(bytes("poi.commit.evidence.v1")));
        assertEq(json.readBytes32(".tags.REASON.tag"), keccak256(bytes("poi.commit.reason.v1")));
        assertEq(json.readBytes32(".tags.NOTE.tag"), keccak256(bytes("poi.commit.note.v1")));
    }

    /// @dev 전 케이스에 대해 프리이미지 재구성 + 해시 재현.
    function test_CommitmentVector_All() public view {
        for (uint256 i; i < caseCount; ++i) {
            bytes32 tag = json.readBytes32(_path(i, "tag"));
            uint256 chainId = json.readUint(_path(i, "chainId"));
            address attester = json.readAddress(_path(i, "attester"));
            bytes memory salt = json.readBytes(_path(i, "salt"));
            string memory jcs = json.readString(_path(i, "jcs"));
            bytes memory expectedPreimage = json.readBytes(_path(i, "preimage"));
            bytes32 expected = json.readBytes32(_path(i, "commitment"));

            assertEq(salt.length, 16, "salt must be 16 bytes");

            bytes memory preimage = abi.encodePacked(tag, chainId, attester, salt, bytes(jcs));

            assertEq(preimage, expectedPreimage, string.concat("preimage mismatch @", vm.toString(i)));
            assertEq(keccak256(preimage), expected, string.concat("commitment mismatch @", vm.toString(i)));
        }
    }

    /// @dev ★ B3 — attester·chainId 결속. 프리이미지에서 이 둘을 빼면 복사 공격이 성립한다.
    function test_CommitmentVector_AttesterAndChainBinding() public view {
        bytes32 alice = json.readBytes32(".cases[0].commitment"); // decision_ko
        bytes32 bob = json.readBytes32(".cases[4].commitment"); // 동일 payload·salt, attester만 다름
        bytes32 otherChain = json.readBytes32(".cases[5].commitment"); // chainId만 다름

        assertEq(json.readString(".cases[0].jcs"), json.readString(".cases[4].jcs"), "payload must be identical");
        assertTrue(alice != bob, "attester not bound - copy attack possible");
        assertTrue(alice != otherChain, "chainId not bound - cross-chain replay possible");
    }
}
