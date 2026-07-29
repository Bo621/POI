import assert from "node:assert/strict";
import test from "node:test";
import {VERDICT} from "../src/verify.ts";
import {exitCodeFor} from "../src/cli.ts";

/**
 * 문서(gitbook/verify/exit-codes.md)가 정의한 계약이다.
 * NOT_REQUIRED 가 0 이면 「검증됨」과 구별되지 않는다 — 실제로 0 이었다.
 */
test("종료코드는 문서의 정의와 같다", () => {
    assert.equal(exitCodeFor(VERDICT.MATCH), 0);
    assert.equal(exitCodeFor(VERDICT.MISMATCH), 1);
    assert.equal(exitCodeFor(VERDICT.NO_SETTLEMENT), 3);
    assert.equal(exitCodeFor(VERDICT.NO_OBSERVATION), 3);
    assert.equal(exitCodeFor(VERDICT.NOT_REQUIRED), 3, "검증할 대상이 없는 것은 0 이 아니다");
});
