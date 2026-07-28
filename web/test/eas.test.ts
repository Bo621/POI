import {describe, expect, it} from "vitest";
import {
    BaseError,
    ContractFunctionRevertedError,
    decodeAbiParameters,
    RawContractError,
    type Hex,
} from "viem";
import {DECISION_PARAMETERS, encodeDecisionData, revertData, type DecisionFields} from "../src/eas";

const uid = (byte: string) => `0x${byte.repeat(64)}` as Hex;

describe("encodeDecisionData", () => {
    it("평면 튜플을 필드 순서대로 왕복 인코딩한다", () => {
        const fields: DecisionFields = {
            parents: [uid("1"), uid("2")],
            promotedFromNote: uid("3"),
            verifiedAddressUID: uid("4"),
            decisionCommitment: uid("5"),
            triggerCommitment: uid("6"),
            evidenceCommitment: uid("7"),
            reasonCommitment: uid("8"),
            hasExpectedOutcome: true,
            outcomeMetricId: uid("9"),
            outcomeOp: 2,
            outcomeThreshold: -15n,
            windowStart: 100n,
            windowEnd: 200n,
            graceSeconds: 3600,
        };
        const encoded = encodeDecisionData(fields);
        const decoded = decodeAbiParameters(DECISION_PARAMETERS, encoded);
        expect(decoded).toEqual([
            fields.parents,
            fields.promotedFromNote,
            fields.verifiedAddressUID,
            fields.decisionCommitment,
            fields.triggerCommitment,
            fields.evidenceCommitment,
            fields.reasonCommitment,
            fields.hasExpectedOutcome,
            fields.outcomeMetricId,
            fields.outcomeOp,
            fields.outcomeThreshold,
            fields.windowStart,
            fields.windowEnd,
            fields.graceSeconds,
        ]);
        expect((encoded.length - 2) / 2).toBe(14 * 32 + 32 + 32 * fields.parents.length);
    });
});

describe("revertData", () => {
    it("ContractFunctionRevertedError의 raw data를 cause 체인에서 찾는다", () => {
        const data = "0x12345678" as Hex;
        const cause = new ContractFunctionRevertedError({
            abi: [],
            data,
            functionName: "attest",
        });
        expect(revertData(new BaseError("simulation failed", {cause}))).toBe(data);
    });

    it("RawContractError의 중첩 data를 cause 체인에서 찾는다", () => {
        const data = "0x87654321" as Hex;
        const cause = new RawContractError({data: {data}});
        expect(revertData(new BaseError("simulation failed", {cause}))).toBe(data);
    });
});
