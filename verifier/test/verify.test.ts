import assert from "node:assert/strict";
import test from "node:test";
import {RESULT} from "@poi/core";
import type {Hex} from "viem";
import {MetricRegistry, type MetricProvider} from "../src/metric.ts";
import type {ChainReader, OnChainDecision, OnChainSettlement} from "../src/reader.ts";
import {VERDICT, VerifyError, verifyDecision} from "../src/verify.ts";
import {VERIFIER_VERSION} from "../src/version.ts";

const uid = (byte: string): Hex => `0x${byte.repeat(64)}`;
const DECISION_UID = uid("1");
const SETTLEMENT_UID = uid("2");
const METRIC_ID = uid("3");
const ZERO_UID = uid("0");

const decision = (overrides: Partial<OnChainDecision> = {}): OnChainDecision => ({
    uid: DECISION_UID,
    attester: uid("a"),
    time: 1n,
    revocationTime: 0n,
    hasExpectedOutcome: true,
    outcomeMetricId: METRIC_ID,
    outcomeOp: 1,
    outcomeThreshold: 600n,
    windowStart: 100n,
    windowEnd: 200n,
    graceSeconds: 10n,
    evidenceCommitment: uid("e"),
    ...overrides,
});
const settlement = (overrides: Partial<OnChainSettlement> = {}): OnChainSettlement => ({
    uid: SETTLEMENT_UID,
    attester: uid("b"),
    time: 205n,
    revocationTime: 0n,
    result: RESULT.OBSERVED,
    hasObservedValue: true,
    observedValue: 601n,
    source: "chain",
    observedAt: 200n,
    verifierVersion: VERIFIER_VERSION,
    supersedes: ZERO_UID,
    ...overrides,
});

class FakeReader implements ChainReader {
    decision: OnChainDecision | undefined = decision();
    head: Hex = SETTLEMENT_UID;
    revokeCount = 0;
    settlement: OnChainSettlement | undefined = settlement();
    decimals = 2;

    async getDecision(): Promise<OnChainDecision | undefined> { return this.decision; }
    async getActiveHead(): Promise<Hex> { return this.head; }
    async getRevokeCount(): Promise<number> { return this.revokeCount; }
    async getSettlement(): Promise<OnChainSettlement | undefined> { return this.settlement; }
    async getMetricDecimals(): Promise<number> { return this.decimals; }
}

function registry(raw = "6.01"): MetricRegistry {
    const metrics = new MetricRegistry();
    const provider: MetricProvider = {
        metricId: METRIC_ID,
        async observe() { return {raw, source: "independent", observedAt: 200n}; },
    };
    metrics.register(provider);
    return metrics;
}

const verify = (reader: FakeReader, metrics?: MetricRegistry) =>
    verifyDecision({reader, metrics, decisionUID: DECISION_UID, now: 210n});

test("verifier version is fixed", () => {
    assert.equal(VERIFIER_VERSION, "poi-verifier/1.0.0");
});

test("a decision without an expected outcome is not required", async () => {
    const reader = new FakeReader();
    reader.decision = decision({hasExpectedOutcome: false});
    assert.equal((await verify(reader)).verdict, VERDICT.NOT_REQUIRED);
});

test("missing settlement after the deadline is overdue", async () => {
    const reader = new FakeReader();
    reader.head = ZERO_UID;
    reader.settlement = undefined;
    const report = await verify(reader);
    assert.equal(report.verdict, VERDICT.NO_SETTLEMENT);
    assert.equal(report.state, "OVERDUE");
});

test("revoked settlement history is distinguishable", async () => {
    const reader = new FakeReader();
    reader.head = ZERO_UID;
    reader.settlement = undefined;
    reader.revokeCount = 1;
    assert.equal((await verify(reader)).hasRevokedSettlement, true);
});

test("a self-consistent settlement without a provider has no observation", async () => {
    assert.equal((await verify(new FakeReader())).verdict, VERDICT.NO_OBSERVATION);
});

test("observedAt must equal windowEnd", async () => {
    const reader = new FakeReader();
    reader.settlement = settlement({observedAt: 199n});
    assert.equal((await verify(reader)).verdict, VERDICT.MISMATCH);
});

test("a result without an observed value must be indeterminate", async () => {
    const reader = new FakeReader();
    reader.settlement = settlement({hasObservedValue: false, result: RESULT.OBSERVED});
    assert.equal((await verify(reader)).verdict, VERDICT.MISMATCH);
});

test("the on-chain result must agree with its observed value", async () => {
    const reader = new FakeReader();
    reader.settlement = settlement({result: RESULT.NOT_OBSERVED});
    assert.equal((await verify(reader)).verdict, VERDICT.MISMATCH);
});

test("an equal independent value matches", async () => {
    assert.equal((await verify(new FakeReader(), registry())).verdict, VERDICT.MATCH);
});

test("a different independent value reports both values", async () => {
    const report = await verify(new FakeReader(), registry("5.99"));
    assert.equal(report.verdict, VERDICT.MISMATCH);
    assert.match(report.problems.join(" "), /599/);
    assert.match(report.problems.join(" "), /601/);
});

test("an equal value with a contrary on-chain result mismatches", async () => {
    const reader = new FakeReader();
    reader.settlement = settlement({result: RESULT.NOT_OBSERVED});
    const report = await verify(reader, registry());
    assert.equal(report.independent?.scaledValue, 601n);
    assert.equal(report.verdict, VERDICT.MISMATCH);
});

test("a revoked decision with a settlement reports a problem", async () => {
    const reader = new FakeReader();
    reader.decision = decision({revocationTime: 150n});
    assert.notEqual((await verify(reader)).problems.length, 0);
});

test("a missing decision raises VerifyError", async () => {
    const reader = new FakeReader();
    reader.decision = undefined;
    await assert.rejects(() => verify(reader), VerifyError);
});

test("decimal observations use core half-up scaling", async () => {
    const report = await verify(new FakeReader(), registry("6.005"));
    assert.equal(report.independent?.scaledValue, 601n);
});
