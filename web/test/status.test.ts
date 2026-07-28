import {STATE} from "@poi/core";
import {describe, expect, it} from "vitest";
import {describeState} from "../src/status";

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
