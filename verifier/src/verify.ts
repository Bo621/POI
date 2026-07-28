import {
    METRICS,
    RESULT,
    deriveState,
    evalPredicate,
    scale,
    settlementResult,
    type Op,
    type PoiState,
} from "@poi/core";
import type {Hex} from "viem";
import type {CandleRow, MetricRegistry} from "./metric.ts";
import type {ChainReader, OnChainSettlement} from "./reader.ts";
import {snapshotHash} from "./snapshot.ts";
import {VERIFIER_VERSION} from "./version.ts";

export const VERDICT = {
    MATCH: "MATCH",
    MISMATCH: "MISMATCH",
    NO_SETTLEMENT: "NO_SETTLEMENT",
    NOT_REQUIRED: "NOT_REQUIRED",
    NO_OBSERVATION: "NO_OBSERVATION",
} as const;

export interface VerifyReport {
    verifierVersion: string;
    decisionUID: Hex;
    verdict: (typeof VERDICT)[keyof typeof VERDICT];
    state: PoiState;
    hasRevokedSettlement: boolean;
    settlementUID?: Hex;
    onChain?: {result: number; observedValue: bigint | null; observedAt: bigint; source: string};
    independent?: {
        scaledValue: bigint;
        expectedResult: number;
        raw: string;
        source: string;
        snapshot: CandleRow[];
        snapshotHash: Hex;
    };
    problems: string[];
}

export class VerifyError extends Error {}

const ZERO_UID = `0x${"00".repeat(32)}` as Hex;

function onChainView(settlement: OnChainSettlement): NonNullable<VerifyReport["onChain"]> {
    return {
        result: settlement.result,
        observedValue: settlement.hasObservedValue ? settlement.observedValue : null,
        observedAt: settlement.observedAt,
        source: settlement.source,
    };
}

export async function verifyDecision(args: {
    reader: ChainReader;
    metrics?: MetricRegistry;
    decisionUID: Hex;
    now: bigint;
}): Promise<VerifyReport> {
    const decision = await args.reader.getDecision(args.decisionUID);
    if (!decision) throw new VerifyError(`결정을 찾을 수 없다: ${args.decisionUID}`);

    const problems: string[] = [];
    if (decision.revocationTime !== 0n) {
        problems.push(`결정이 ${decision.revocationTime}에 철회됐지만 정산 판정을 계속한다.`);
    }

    const [activeHead, revokeCount] = await Promise.all([
        args.reader.getActiveHead(args.decisionUID),
        args.reader.getRevokeCount(args.decisionUID),
    ]);
    const hasActiveHead = activeHead !== ZERO_UID && !/^0x0+$/i.test(activeHead);
    const settlement = hasActiveHead ? await args.reader.getSettlement(activeHead) : undefined;
    if (hasActiveHead && !settlement) {
        throw new VerifyError(`활성 정산을 찾을 수 없다: ${activeHead}`);
    }
    const derived = deriveState({
        hasExpectedOutcome: decision.hasExpectedOutcome,
        windowStart: decision.windowStart,
        windowEnd: decision.windowEnd,
        graceSeconds: decision.graceSeconds,
        activeHead,
        activeHeadTime: settlement?.time,
        revokeCount,
    }, args.now);
    const base = {
        verifierVersion: VERIFIER_VERSION,
        decisionUID: args.decisionUID,
        state: derived.state,
        hasRevokedSettlement: derived.hasRevokedSettlement,
        problems,
    };

    if (!decision.hasExpectedOutcome) {
        return {...base, verdict: VERDICT.NOT_REQUIRED};
    }
    const manifest = METRICS.find((metric) =>
        metric.metricId.toLowerCase() === decision.outcomeMetricId.toLowerCase());
    if (!manifest) {
        problems.push(`manifest에 없는 metricId다: ${decision.outcomeMetricId}`);
        return {
            ...base,
            verdict: VERDICT.NO_OBSERVATION,
            ...(settlement ? {settlementUID: activeHead, onChain: onChainView(settlement)} : {}),
        };
    }

    const onChainMetric = await args.reader.getMetric(decision.outcomeMetricId);
    let metricMismatch = false;
    if (!onChainMetric.allowed) {
        problems.push(`온체인 지표 ${decision.outcomeMetricId}가 허용되지 않았다.`);
        metricMismatch = true;
    }
    if (onChainMetric.kind !== 0) {
        problems.push(`온체인 지표 kind ${onChainMetric.kind}가 기대값 0과 다르다.`);
        metricMismatch = true;
    }
    if (!onChainMetric.frozen) {
        problems.push(`온체인 지표 ${decision.outcomeMetricId}가 frozen 상태가 아니다.`);
    }
    if (onChainMetric.decimals !== manifest.decimals) {
        problems.push(
            `온체인 decimals ${onChainMetric.decimals}가 manifest decimals ${manifest.decimals}와 다르다.`,
        );
        metricMismatch = true;
    }
    if (onChainMetric.definitionHash.toLowerCase() !== manifest.definitionHash.toLowerCase()) {
        problems.push(
            `온체인 definitionHash ${onChainMetric.definitionHash}가 manifest definitionHash ${manifest.definitionHash}와 다르다.`,
        );
        metricMismatch = true;
    }
    if (!settlement) {
        return {...base, verdict: metricMismatch ? VERDICT.MISMATCH : VERDICT.NO_SETTLEMENT};
    }

    const report: VerifyReport = {
        ...base,
        verdict: VERDICT.NO_OBSERVATION,
        settlementUID: activeHead,
        onChain: onChainView(settlement),
    };
    let inconsistent = metricMismatch;
    if (settlement.observedAt !== decision.windowEnd) {
        problems.push(`온체인 observedAt ${settlement.observedAt}이 windowEnd ${decision.windowEnd}와 다르다.`);
        inconsistent = true;
    }
    if (!settlement.hasObservedValue && settlement.result !== RESULT.INDETERMINATE) {
        problems.push(`관측값이 없는데 온체인 result가 ${settlement.result}이다.`);
        inconsistent = true;
    }
    if (settlement.hasObservedValue) {
        const expected = settlementResult({
            hasObservedValue: true,
            scaledValue: settlement.observedValue,
            op: decision.outcomeOp as Op,
            threshold: decision.outcomeThreshold,
        });
        if (settlement.result !== expected) {
            problems.push(`온체인 result ${settlement.result}가 관측값 판정 ${expected}와 다르다.`);
            inconsistent = true;
        }
    }

    const provider = args.metrics?.get(decision.outcomeMetricId);
    if (!provider) {
        report.verdict = inconsistent ? VERDICT.MISMATCH : VERDICT.NO_OBSERVATION;
        return report;
    }
    const observation = await provider.observe(decision.windowStart, decision.windowEnd);
    if (observation.kind === "error") {
        throw new VerifyError(`지표 조회 실패: ${observation.reason}`);
    }
    if (observation.kind === "insufficient") {
        if (settlement.result !== RESULT.INDETERMINATE || settlement.hasObservedValue) {
            problems.push(
                `독립 관측은 데이터 부족(${observation.reason})인데 온체인 result가 ${settlement.result}이다.`,
            );
            inconsistent = true;
        }
        report.verdict = inconsistent ? VERDICT.MISMATCH : VERDICT.MATCH;
        return report;
    }

    const scaledValue = scale(observation.raw, manifest.decimals);
    const expectedResult = settlementResult({
        hasObservedValue: true,
        scaledValue,
        op: decision.outcomeOp as Op,
        threshold: decision.outcomeThreshold,
    });
    // 명시적으로 core의 predicate도 사용해 verifier와 core의 판정 경로를 고정한다.
    evalPredicate(decision.outcomeOp as Op, scaledValue, decision.outcomeThreshold);
    report.independent = {
        scaledValue,
        expectedResult,
        raw: observation.raw,
        source: observation.source,
        snapshot: observation.snapshot,
        snapshotHash: snapshotHash(observation.snapshot),
    };
    if (!settlement.hasObservedValue) {
        problems.push(`독립 관측값 ${scaledValue}이 있지만 온체인에는 관측값이 없다.`);
        inconsistent = true;
    } else if (scaledValue !== settlement.observedValue) {
        problems.push(`독립 관측값 ${scaledValue}과 온체인 관측값 ${settlement.observedValue}이 다르다.`);
        inconsistent = true;
    }
    if (expectedResult !== settlement.result) {
        problems.push(`독립 판정 ${expectedResult}과 온체인 result ${settlement.result}가 다르다.`);
        inconsistent = true;
    }
    report.verdict = inconsistent ? VERDICT.MISMATCH : VERDICT.MATCH;
    return report;
}
