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
