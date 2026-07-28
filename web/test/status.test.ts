import {STATE} from "@poi/core";
import {describe, expect, it} from "vitest";
import {clockSkewNotice, describeState} from "../src/status";

describe("describeState", () => {
    it.each([
        [STATE.NOT_REQUIRED, "예상 결과를 선언하지 않음"],
        [STATE.PENDING, "관측 구간 시작 전"],
        [STATE.OBSERVING, "관측 구간 진행 중"],
        [STATE.AWAITING, "구간이 끝나 결과를 등록할 수 있습니다"],
        [STATE.OVERDUE, "유예까지 지나 등록 기한이 지났습니다"],
        [STATE.SETTLED, "결과가 등록됨"],
        [STATE.SETTLED_LATE, "기한 후에 등록됨"],
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
