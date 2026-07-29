import {describe, expect, it} from "vitest";
import {assertSchema, WrongSchemaError} from "../src/read";
import type {Hex} from "viem";

const A = `0x${"a".repeat(64)}` as Hex;
const B = `0x${"b".repeat(64)}` as Hex;

describe("assertSchema", () => {
    it("같은 스키마는 통과한다", () => {
        expect(() => assertSchema(A, A)).not.toThrow();
    });

    it("대소문자가 달라도 같은 값이면 통과한다", () => {
        expect(() => assertSchema(A.toUpperCase().replace("0X", "0x") as Hex, A)).not.toThrow();
    });

    it("다른 스키마는 거부한다 — 아무 attestation 이나 POI 기록처럼 보이면 안 된다", () => {
        expect(() => assertSchema(B, A)).toThrow(WrongSchemaError);
    });
});
