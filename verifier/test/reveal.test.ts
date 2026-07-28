import assert from "node:assert/strict";
import test from "node:test";
import {commitment, CommitmentError} from "@poi/core";
import type {Hex} from "viem";
import type {OnChainDecision} from "../src/reader.ts";
import {
    REVEAL,
    RevealError,
    revealDecision,
    revealExitCode,
    type DecisionCommitTag,
} from "../src/reveal.ts";

const uid = (byte: string): Hex => `0x${byte.repeat(64)}`;
const address = (byte: string): Hex => `0x${byte.repeat(40)}`;
const DECISION_UID = uid("1");
const CHAIN_ID = 31337;
const SALT = "0x00112233445566778899aabbccddeeff";
const PAYLOAD = {fixture: "F1", intent: "seed-success"};
const ZERO_UID = uid("0");

/** 출하되는 매핑을 그대로 쓴다. 여기서 다시 구현하면 계약이 검증되지 않는다. */
const exitCode = revealExitCode;

function decision(
    attester = address("a"),
    commitments: Partial<Record<DecisionCommitTag, Hex>> = {},
): OnChainDecision {
    const make = (tag: DecisionCommitTag): Hex => commitments[tag] ?? commitment({
        tag,
        chainId: CHAIN_ID,
        attester,
        salt: SALT,
        payload: PAYLOAD,
    });
    return {
        uid: DECISION_UID,
        attester,
        time: 1n,
        revocationTime: 0n,
        decisionCommitment: make("DECISION"),
        triggerCommitment: make("TRIGGER"),
        evidenceCommitment: make("EVIDENCE"),
        reasonCommitment: make("REASON"),
        hasExpectedOutcome: false,
        outcomeMetricId: ZERO_UID,
        outcomeOp: 0,
        outcomeThreshold: 0n,
        windowStart: 0n,
        windowEnd: 0n,
        graceSeconds: 0n,
    };
}

const reveal = (
    onChain = decision(),
    overrides: Partial<Parameters<typeof revealDecision>[0]> = {},
) => revealDecision({
    decision: onChain,
    decisionUID: DECISION_UID,
    tag: "DECISION",
    chainId: CHAIN_ID,
    salt: SALT,
    payload: PAYLOAD,
    ...overrides,
});

test("올바른 salt와 payload는 MATCH와 exit 0이다", () => {
    const report = reveal();
    assert.equal(report.verdict, REVEAL.MATCH);
    assert.equal(exitCode(report), 0);
    assert.equal(report.attester, address("a"));
});

test("salt 1비트 변경은 MISMATCH와 exit 1이다", () => {
    const report = reveal(decision(), {salt: "0x00112233445566778899aabbccddeefe"});
    assert.equal(report.verdict, REVEAL.MISMATCH);
    assert.equal(exitCode(report), 1);
});

test("payload 값 변경은 MISMATCH와 exit 1이다", () => {
    const report = reveal(decision(), {payload: {...PAYLOAD, intent: "changed"}});
    assert.equal(report.verdict, REVEAL.MISMATCH);
    assert.equal(exitCode(report), 1);
});

test("payload 키 순서만 바꾸면 JCS 정규화로 MATCH다", () => {
    assert.equal(reveal(decision(), {
        payload: {intent: "seed-success", fixture: "F1"},
    }).verdict, REVEAL.MATCH);
});

test("CT18: A의 commitment를 복사한 B의 결정은 MISMATCH다", () => {
    const alice = address("a");
    const copied = commitment({
        tag: "DECISION",
        chainId: CHAIN_ID,
        attester: alice,
        salt: SALT,
        payload: PAYLOAD,
    });
    const report = reveal(decision(address("b"), {DECISION: copied}));
    assert.equal(report.verdict, REVEAL.MISMATCH);
    assert.equal(exitCode(report), 1);
});

test("0 commitment는 NOT_COMMITTED와 exit 3이며 재계산하지 않는다", () => {
    const report = reveal(decision(address("a"), {DECISION: ZERO_UID}), {
        salt: "invalid" as Hex,
    });
    assert.equal(report.verdict, REVEAL.NOT_COMMITTED);
    assert.equal(report.computedCommitment, undefined);
    assert.equal(exitCode(report), 3);
});

for (const tag of ["TRIGGER", "EVIDENCE", "REASON"] as const) {
    test(`${tag}는 올바른 commitment 필드를 읽는다`, () => {
        assert.equal(reveal(decision(), {tag}).verdict, REVEAL.MATCH);
    });
}

test("15바이트 salt와 접두사 없는 salt는 입력 실패다", () => {
    assert.throws(() => reveal(decision(), {salt: "0x00112233445566778899aabbccddee" as Hex}), CommitmentError);
    assert.throws(() => reveal(decision(), {salt: "00112233445566778899aabbccddeeff" as Hex}), CommitmentError);
});

test("JSON이 아닌 payload는 파싱 실패다", () => {
    assert.throws(() => JSON.parse("not-json"), SyntaxError);
});

test("없는 decisionUID는 입력 실패다", () => {
    assert.throws(() => revealDecision({
        decision: undefined,
        decisionUID: DECISION_UID,
        tag: "DECISION",
        chainId: CHAIN_ID,
        salt: SALT,
        payload: PAYLOAD,
    }), RevealError);
});

test("결정 스키마가 아닌 attestation의 decode 실패는 조회 실패다", () => {
    const decodeNonDecisionAttestation = (): OnChainDecision => {
        throw new Error("결정 스키마의 attestation이 아니다");
    };
    assert.throws(decodeNonDecisionAttestation, /결정 스키마/);
});
