import {STATE} from "@poi/core";
import {describe, expect, it} from "vitest";
import {clockSkewNotice, describeState} from "../src/status";

describe("describeState", () => {
    it.each([
        [STATE.NOT_REQUIRED, "예상 결과 없음"],
        [STATE.PENDING, "구간 시작 전"],
        [STATE.OBSERVING, "관측 중"],
        [STATE.AWAITING, "정산 대기"],
        [STATE.OVERDUE, "정산 기한 초과"],
        [STATE.SETTLED, "정산됨"],
        [STATE.SETTLED_LATE, "정산됨(기한 후)"],
    ])("%s", (state, label) => expect(describeState(state)).toBe(label));
});

describe("clockSkewNotice", () => {
    it.each([0n, 59n])("does not warn for %s seconds", (difference) => {
        expect(clockSkewNotice(1_000n + difference, 1_000n)).toBeUndefined();
    });

    it.each([60n, 3_600n])("includes a %s second difference", (difference) => {
        expect(clockSkewNotice(1_000n + difference, 1_000n)).toContain(`${difference}초`);
    });

    it("uses the absolute difference when the chain is behind", () => {
        expect(clockSkewNotice(1_000n, 1_060n)).toContain("60초");
    });
});
