import {STATE} from "@poi/core";
import {describe, expect, it} from "vitest";
import type {Hex} from "viem";
import {needsAction, type RecordRow} from "../src/records";

const row = (state: RecordRow["state"]): RecordRow => ({
    uid: `0x${"1".repeat(64)}` as Hex,
    committedAt: 1n,
    state,
    hasRevoked: false,
    grade: "SELF_DECLARED · SEALED",
});

describe("needsAction", () => {
    it("keeps only awaiting and overdue rows without reordering them", () => {
        const rows = [row(STATE.SETTLED), row(STATE.OVERDUE), row(STATE.AWAITING), row(STATE.PENDING)];
        expect(needsAction(rows)).toEqual([rows[1], rows[2]]);
    });
});
