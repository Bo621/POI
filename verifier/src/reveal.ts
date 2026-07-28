import {commitment, verifyReveal, type CommitTagName} from "@poi/core";
import type {Hex} from "viem";
import type {OnChainDecision} from "./reader.ts";

export type DecisionCommitTag = Exclude<CommitTagName, "NOTE">;

export const REVEAL = {
    MATCH: "MATCH",
    MISMATCH: "MISMATCH",
    NOT_COMMITTED: "NOT_COMMITTED",
} as const;

export interface RevealReport {
    verdict: (typeof REVEAL)[keyof typeof REVEAL];
    tag: DecisionCommitTag;
    decisionUID: Hex;
    attester: Hex;
    onChainCommitment: Hex;
    computedCommitment: Hex | undefined;
    chainId: number;
}

export class RevealError extends Error {}

/**
 * 종료 코드 — poi-verify와 같은 규율.
 * 0 일치 · 1 불일치 · 3 커밋한 적 없음. (2는 조회·입력 실패로 CLI가 낸다)
 *
 * NOT_COMMITTED를 0으로 두면 "검증됐다"와 구별되지 않고, 1로 묶으면 "틀렸다"와 뭉개진다.
 * CLI가 아니라 여기 두는 이유: `reveal-cli.ts`는 로드 시 main()이 실행되므로
 * 테스트가 임포트할 수 없다. 계약이 테스트되지 않는 자리에 있으면 안 된다.
 */
export function revealExitCode(report: RevealReport): number {
    if (report.verdict === REVEAL.MISMATCH) return 1;
    if (report.verdict === REVEAL.NOT_COMMITTED) return 3;
    return 0;
}

const commitmentFor = (
    decision: OnChainDecision,
    tag: DecisionCommitTag,
): Hex => ({
    DECISION: decision.decisionCommitment,
    TRIGGER: decision.triggerCommitment,
    EVIDENCE: decision.evidenceCommitment,
    REASON: decision.reasonCommitment,
})[tag];

export function revealDecision(args: {
    decision: OnChainDecision | undefined;
    decisionUID: Hex;
    tag: DecisionCommitTag;
    chainId: number;
    salt: Hex;
    payload: unknown;
}): RevealReport {
    if (!args.decision) throw new RevealError(`결정을 찾을 수 없다: ${args.decisionUID}`);

    const onChainCommitment = commitmentFor(args.decision, args.tag);
    const base = {
        tag: args.tag,
        decisionUID: args.decisionUID,
        attester: args.decision.attester,
        onChainCommitment,
        chainId: args.chainId,
    };
    if (/^0x0{64}$/i.test(onChainCommitment)) {
        return {...base, verdict: REVEAL.NOT_COMMITTED, computedCommitment: undefined};
    }

    const input = {
        tag: args.tag,
        chainId: args.chainId,
        attester: args.decision.attester,
        salt: args.salt,
        payload: args.payload,
    };
    const computedCommitment = commitment(input);
    return {
        ...base,
        verdict: verifyReveal(input, onChainCommitment) ? REVEAL.MATCH : REVEAL.MISMATCH,
        computedCommitment,
    };
}
