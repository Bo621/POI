import {describe, expect, it} from "vitest";
import {OP, evalPredicate} from "@poi/core";
import {op} from "../src/decisionDetail";

/**
 * 화면의 조건 기호가 실제 판정과 같은 것을 가리키는지 고정한다.
 * 이 표가 core·컨트랙트와 어긋나면 검증하는 사람이 잘못된 조건을 읽는다.
 * 실제로 여섯 개가 전부 어긋난 채로 배포될 뻔했다.
 */
describe("조건 기호", () => {
    it.each([
        [OP.GT, ">", 2n, 1n, true],
        [OP.GTE, "≥", 1n, 1n, true],
        [OP.LT, "<", 0n, 1n, true],
        [OP.LTE, "≤", 1n, 1n, true],
        [OP.EQ, "=", 1n, 1n, true],
        [OP.NEQ, "≠", 2n, 1n, true],
    ])("op %i는 %s이고 판정과 일치한다", (code, symbol, value, threshold, expected) => {
        expect(op(code)).toBe(symbol);
        expect(evalPredicate(code, value, threshold)).toBe(expected);
    });

    it("모르는 op는 숫자를 그대로 보여준다", () => {
        expect(op(9)).toBe("9");
    });
});
