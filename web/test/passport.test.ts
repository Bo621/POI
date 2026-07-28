import {readFileSync} from "node:fs";
import {STATE} from "@poi/core";
import {describe, expect, it} from "vitest";
import type {Hex} from "viem";
import {sortByCommittedAtDesc, summarizeRow, type PassportRow} from "../src/passport";

const uid = (digit: string) => `0x${digit.repeat(64)}` as Hex;
const row = (digit: string, committedAt: bigint): PassportRow => ({
    uid: uid(digit),
    committedAt,
    state: STATE.SETTLED,
    hasRevoked: false,
    grade: "EVIDENCE_COMMITTED · SEALED",
});

describe("passport helpers", () => {
    it("sorts newest first and preserves equal-time input order", () => {
        const rows = [row("1", 1n), row("2", 3n), row("3", 3n)];
        expect(sortByCommittedAtDesc(rows).map(({uid: value}) => value))
            .toEqual([uid("2"), uid("3"), uid("1")]);
    });

    it("summarizes the seven state labels and two-axis grade", () => {
        const labels = [
            [STATE.NOT_REQUIRED, "예상 결과 없음"],
            [STATE.PENDING, "구간 시작 전"],
            [STATE.OBSERVING, "관측 중"],
            [STATE.AWAITING, "정산 대기"],
            [STATE.OVERDUE, "정산 기한 초과"],
            [STATE.SETTLED, "정산됨"],
            [STATE.SETTLED_LATE, "정산됨(기한 후)"],
        ] as const;
        for (const [state, label] of labels) {
            expect(summarizeRow({...row("1", 1n), state})).toEqual({
                label,
                grade: "EVIDENCE_COMMITTED · SEALED",
            });
        }
    });

    it("contains no aggregation or performance language", () => {
        const source = readFileSync(new URL("../src/passport.tsx", import.meta.url), "utf8");
        for (const forbidden of ["reduce(", "평균", "적중", "승률"]) {
            expect(source).not.toContain(forbidden);
        }
    });
});
