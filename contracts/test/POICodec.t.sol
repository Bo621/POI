// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {POICodec} from "../src/POICodec.sol";

/// @dev calldata 진입점. 라이브러리 함수가 `bytes calldata`를 받으므로 외부 호출이 필요하다.
contract CodecHarness {
    function decodeDecision(bytes calldata d) external pure returns (POICodec.DecisionData memory) {
        return POICodec.decodeDecision(d);
    }

    function decodeSettlement(bytes calldata d) external pure returns (POICodec.SettlementData memory) {
        return POICodec.decodeSettlement(d);
    }

    function decodeChallenge(bytes calldata d) external pure returns (POICodec.ChallengeData memory) {
        return POICodec.decodeChallenge(d);
    }

    function decodeNote(bytes calldata d) external pure returns (bytes32) {
        return POICodec.decodeNote(d);
    }

    /// @dev 트릭 없이 그대로 디코딩 — **revert해야 한다**. 이게 C1이 존재하는 이유다.
    function decodeDecisionNaive(bytes calldata d) external pure returns (POICodec.DecisionData memory) {
        return abi.decode(d, (POICodec.DecisionData));
    }
}

/// @notice C1 — `_decodeDecision` offset 트릭 (§6.1).
contract POICodecTest is Test {
    CodecHarness internal h;

    function setUp() public {
        h = new CodecHarness();
    }

    /// @dev EAS `SchemaEncoder`가 만드는 평면 튜플 인코딩을 그대로 재현한다.
    ///      스키마 필드 순서와 1:1로 대응해야 하며, 순서가 어긋나면 조용히 잘못 디코딩된다.
    function _encodeDecision(POICodec.DecisionData memory d) internal pure returns (bytes memory) {
        return abi.encode(
            d.parents,
            d.promotedFromNote,
            d.verifiedAddressUID,
            d.decisionCommitment,
            d.triggerCommitment,
            d.evidenceCommitment,
            d.reasonCommitment,
            d.hasExpectedOutcome,
            d.outcomeMetricId,
            d.outcomeOp,
            d.outcomeThreshold,
            d.windowStart,
            d.windowEnd,
            d.graceSeconds
        );
    }

    function _sample(uint256 parentCount) internal pure returns (POICodec.DecisionData memory d) {
        d.parents = new bytes32[](parentCount);
        for (uint256 i; i < parentCount; ++i) {
            d.parents[i] = keccak256(abi.encodePacked("parent", i));
        }
        d.promotedFromNote = keccak256("note");
        d.verifiedAddressUID = keccak256("verified");
        d.decisionCommitment = keccak256("decision");
        d.triggerCommitment = keccak256("trigger");
        d.evidenceCommitment = keccak256("evidence");
        d.reasonCommitment = keccak256("reason");
        d.hasExpectedOutcome = true;
        d.outcomeMetricId = keccak256("BTC_30D_REALIZED_VOL_AT_END");
        d.outcomeOp = 1; // GTE
        d.outcomeThreshold = 600; // 60.0% (decimals = 1)
        d.windowStart = 1_800_000_000;
        d.windowEnd = 1_800_600_000;
        d.graceSeconds = 3600;
    }

    function _assertDecisionEq(POICodec.DecisionData memory got, POICodec.DecisionData memory want) internal pure {
        assertEq(got.parents.length, want.parents.length, "parents length");
        for (uint256 i; i < want.parents.length; ++i) {
            assertEq(got.parents[i], want.parents[i], "parent");
        }
        assertEq(got.promotedFromNote, want.promotedFromNote, "promotedFromNote");
        assertEq(got.verifiedAddressUID, want.verifiedAddressUID, "verifiedAddressUID");
        assertEq(got.decisionCommitment, want.decisionCommitment, "decisionCommitment");
        assertEq(got.triggerCommitment, want.triggerCommitment, "triggerCommitment");
        assertEq(got.evidenceCommitment, want.evidenceCommitment, "evidenceCommitment");
        assertEq(got.reasonCommitment, want.reasonCommitment, "reasonCommitment");
        assertEq(got.hasExpectedOutcome, want.hasExpectedOutcome, "hasExpectedOutcome");
        assertEq(got.outcomeMetricId, want.outcomeMetricId, "outcomeMetricId");
        assertEq(got.outcomeOp, want.outcomeOp, "outcomeOp");
        assertEq(got.outcomeThreshold, want.outcomeThreshold, "outcomeThreshold");
        assertEq(got.windowStart, want.windowStart, "windowStart");
        assertEq(got.windowEnd, want.windowEnd, "windowEnd");
        assertEq(got.graceSeconds, want.graceSeconds, "graceSeconds");
    }

    function test_DecodeDecision_RoundTrip() public view {
        POICodec.DecisionData memory want = _sample(3);
        _assertDecisionEq(h.decodeDecision(_encodeDecision(want)), want);
    }

    /// @dev 부모 0개 — 동적 배열이 비어도 offset 트릭은 동일하게 성립해야 한다.
    function test_DecodeDecision_NoParents() public view {
        POICodec.DecisionData memory want = _sample(0);
        _assertDecisionEq(h.decodeDecision(_encodeDecision(want)), want);
    }

    /// @dev 부모 8개 — MAX_PARENTS 경계 (I14).
    function test_DecodeDecision_MaxParents() public view {
        POICodec.DecisionData memory want = _sample(8);
        _assertDecisionEq(h.decodeDecision(_encodeDecision(want)), want);
    }

    /// @dev 음수 임계값도 그대로 살아남아야 한다 — `int128`을 `uint`로 오독하면 여기서 깨진다.
    function test_DecodeDecision_NegativeThreshold() public view {
        POICodec.DecisionData memory want = _sample(1);
        want.outcomeThreshold = -12_345;
        want.hasExpectedOutcome = true;
        _assertDecisionEq(h.decodeDecision(_encodeDecision(want)), want);
    }

    /// @dev `hasExpectedOutcome = false`면 나머지 outcome 필드가 0이어야 한다 (I6d 전제).
    function test_DecodeDecision_NoOutcome() public view {
        POICodec.DecisionData memory want = _sample(2);
        want.hasExpectedOutcome = false;
        want.outcomeMetricId = bytes32(0);
        want.outcomeOp = 0;
        want.outcomeThreshold = 0;
        want.windowStart = 0;
        want.windowEnd = 0;
        want.graceSeconds = 0;
        _assertDecisionEq(h.decodeDecision(_encodeDecision(want)), want);
    }

    /// @notice ★ 트릭이 왜 필요한지 — 이 테스트가 통과한다는 것은 순진한 디코딩이 실패한다는 뜻이다.
    function test_DecodeDecision_NaiveDecodeReverts() public {
        bytes memory data = _encodeDecision(_sample(3));
        vm.expectRevert();
        h.decodeDecisionNaive(data);
    }

    function test_DecodeSettlement_RoundTrip() public view {
        POICodec.SettlementData memory want = POICodec.SettlementData({
            decisionUID: keccak256("decision"),
            result: 1, // NOT_OBSERVED
            hasObservedValue: true,
            observedValue: -42,
            source: "upbit 1h close, UTC",
            observedAt: 1_800_600_000,
            verifierVersion: "poi-verifier/1.0.0",
            supersedes: keccak256("s1")
        });

        bytes memory data = abi.encode(
            want.decisionUID,
            want.result,
            want.hasObservedValue,
            want.observedValue,
            want.source,
            want.observedAt,
            want.verifierVersion,
            want.supersedes
        );

        POICodec.SettlementData memory got = h.decodeSettlement(data);
        assertEq(got.decisionUID, want.decisionUID);
        assertEq(got.result, want.result);
        assertEq(got.hasObservedValue, want.hasObservedValue);
        assertEq(got.observedValue, want.observedValue);
        assertEq(got.source, want.source);
        assertEq(got.observedAt, want.observedAt);
        assertEq(got.verifierVersion, want.verifierVersion);
        assertEq(got.supersedes, want.supersedes);
    }

    /// @dev 문자열 두 개가 모두 비어도 오프셋 계산이 어긋나면 안 된다.
    function test_DecodeSettlement_EmptyStrings() public view {
        bytes memory data = abi.encode(
            keccak256("decision"), uint8(2), false, int128(0), "", uint64(1_800_600_000), "", bytes32(0)
        );
        POICodec.SettlementData memory got = h.decodeSettlement(data);
        assertEq(got.result, 2); // INDETERMINATE
        assertEq(bytes(got.source).length, 0);
        assertEq(bytes(got.verifierVersion).length, 0);
        assertEq(got.supersedes, bytes32(0));
    }

    function test_DecodeChallenge_RoundTrip() public view {
        bytes memory data = abi.encode(
            keccak256("settlement"),
            uint8(0),
            true,
            int128(715),
            "coingecko daily close",
            uint64(1_800_600_000),
            keccak256("note")
        );
        POICodec.ChallengeData memory got = h.decodeChallenge(data);
        assertEq(got.settlementUID, keccak256("settlement"));
        assertEq(got.claimedResult, 0);
        assertTrue(got.hasObservedValue);
        assertEq(got.observedValue, 715);
        assertEq(got.source, "coingecko daily close");
        assertEq(got.observedAt, 1_800_600_000);
        assertEq(got.noteCommitment, keccak256("note"));
    }

    /// @dev NOTE는 정적 필드 하나뿐이라 트릭이 필요 없다 — 두 인코딩이 동일하다.
    function test_DecodeNote_NoTrickNeeded() public view {
        assertEq(h.decodeNote(abi.encode(keccak256("content"))), keccak256("content"));
    }
}
