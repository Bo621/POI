import {RESULT} from "@poi/core";
import {describe, expect, it} from "vitest";
import type {Address, Hex} from "viem";
import {buildSettlementPayload, type SettlementForm} from "../src/settlement";
import {ZERO_UID} from "../src/wallet";

const uid = (digit: string) => `0x${digit.repeat(64)}` as Hex;
const decision = {
    attester: "0x1111111111111111111111111111111111111111" as Address,
    outcomeOp: 0,
    outcomeThreshold: 600n,
    windowEnd: 200n,
};
const form = (overrides: Partial<SettlementForm> = {}): SettlementForm => ({
    decisionUID: uid("1"),
    hasObservedValue: true,
    observedValue: "6.01",
    source: "source",
    verifierVersion: "v1",
    activeHead: ZERO_UID,
    lastHead: ZERO_UID,
    ...overrides,
});

describe("buildSettlementPayload", () => {
    it("observedAt은 항상 windowEnd다", () => expect(buildSettlementPayload(form(), decision, 2).observedAt).toBe(200n));
    it("임계 초과는 OBSERVED다", () => expect(buildSettlementPayload(form(), decision, 2).result).toBe(RESULT.OBSERVED));
    it("임계 미달은 NOT_OBSERVED다", () => expect(buildSettlementPayload(form({observedValue: "5.99"}), decision, 2).result).toBe(RESULT.NOT_OBSERVED));
    it("관측값 없음은 INDETERMINATE와 0이다", () => {
        const payload = buildSettlementPayload(form({hasObservedValue: false, observedValue: ""}), decision, 2);
        expect(payload.result).toBe(RESULT.INDETERMINATE);
        expect(payload.observedValue).toBe(0n);
    });
    it("activeHead가 있으면 발행할 수 없다", () => expect(buildSettlementPayload(form({activeHead: uid("2")}), decision, 2).canPublish).toBe(false));
    it("철회 뒤 lastHead를 supersedes로 쓴다", () => expect(buildSettlementPayload(form({lastHead: uid("3")}), decision, 2).supersedes).toBe(uid("3")));
    it("최초 발행은 supersedes가 0이다", () => expect(buildSettlementPayload(form(), decision, 2).supersedes).toBe(ZERO_UID));
    it("6.005를 decimals 2로 half-up한다", () => expect(buildSettlementPayload(form({observedValue: "6.005"}), decision, 2).observedValue).toBe(601n));
});
