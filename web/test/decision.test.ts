import {describe, expect, it} from "vitest";
import type {Address, Hex} from "viem";
import {buildDecisionPayload, type DecisionForm} from "../src/decision";
import {ZERO_UID} from "../src/wallet";

const uid = (digit: string) => `0x${digit.repeat(64)}` as Hex;
const salt = (digit: string) => `0x${digit.repeat(32)}` as Hex;
const NOW = 1_800_000_000;

function form(overrides: Partial<DecisionForm> = {}): DecisionForm {
    return {
        decision: "결정",
        trigger: "조건",
        evidence: "근거",
        reason: "이유",
        hasExpectedOutcome: true,
        outcomeMetricId: uid("9"),
        outcomeOp: 1,
        outcomeThreshold: "100",
        windowStart: NOW + 300,
        windowEnd: NOW + 3600,
        graceSeconds: 86_400,
        parents: [],
        promotedFromNote: "",
        attester: "0x1111111111111111111111111111111111111111" as Address,
        verifiedAddressUID: ZERO_UID,
        salts: {
            decision: salt("1"),
            trigger: salt("2"),
            evidence: salt("3"),
            reason: salt("4"),
        },
        ...overrides,
    };
}

describe("buildDecisionPayload", () => {
    it("예상 결과가 없으면 결과 필드를 모두 0으로 만든다", () => {
        const {fields} = buildDecisionPayload(form({
            hasExpectedOutcome: false,
            outcomeMetricId: uid("9"),
            outcomeOp: 3,
            outcomeThreshold: "55",
            windowStart: NOW + 300,
            windowEnd: NOW + 600,
            graceSeconds: 86_400,
        }), NOW);
        expect([
            fields.outcomeMetricId,
            fields.outcomeOp,
            fields.outcomeThreshold,
            fields.windowStart,
            fields.windowEnd,
            fields.graceSeconds,
        ]).toEqual([ZERO_UID, 0, 0n, 0n, 0n, 0]);
    });

    it("부모가 둘이면 첫 부모를 refUID로 쓴다", () => {
        const parents = [uid("1"), uid("2")];
        expect(buildDecisionPayload(form({parents}), NOW).refUID).toBe(parents[0]);
    });

    it("부모가 아홉이면 거부한다", () => {
        expect(() => buildDecisionPayload(form({parents: Array(9).fill(uid("1"))}), NOW))
            .toThrow("최대 8개");
    });

    it("windowStart가 과거면 거부한다", () => {
        expect(() => buildDecisionPayload(form({windowStart: NOW - 1}), NOW))
            .toThrow("발행 시점 이후");
    });

    it.each([1800, 31 * 24 * 60 * 60])("graceSeconds %s를 거부한다", (graceSeconds) => {
        expect(() => buildDecisionPayload(form({graceSeconds}), NOW))
            .toThrow("1시간 이상 30일 이하");
    });

    it("빈 근거와 이유는 0 commitment로 만든다", () => {
        const {fields} = buildDecisionPayload(form({evidence: "", reason: ""}), NOW);
        expect(fields.evidenceCommitment).toBe(ZERO_UID);
        expect(fields.reasonCommitment).toBe(ZERO_UID);
    });

    it.each([
        ["decision", {decision: ""}],
        ["trigger", {trigger: ""}],
    ] as const)("%s가 비면 거부한다", (_label, override) => {
        expect(() => buildDecisionPayload(form(override), NOW)).toThrow();
    });
});
