import {describe, expect, it} from "vitest";
import type {Hex} from "viem";
import {attestationUrl, buildTxUrl} from "../src/receipt";

const hash = `0x${"ab".repeat(32)}` as Hex;
const explorer = "https://sepolia-explorer.giwa.io";

describe("receipt links", () => {
    it("공개 체인의 트랜잭션 URL을 만든다", () => {
        expect(buildTxUrl(explorer, "https://sepolia-rpc.giwa.io", hash))
            .toBe(`${explorer}/tx/${hash}`);
    });

    it("127.0.0.1 RPC에서는 링크를 만들지 않는다", () => {
        expect(buildTxUrl(explorer, "http://127.0.0.1:8545", hash)).toBeUndefined();
    });

    it("localhost RPC에서는 링크를 만들지 않는다", () => {
        expect(buildTxUrl(explorer, "http://localhost:8545", hash)).toBeUndefined();
    });

    it("attestation UID 전용 링크를 만들지 않는다", () => {
        expect(attestationUrl(hash)).toBeUndefined();
    });

    it("익스플로러 URL 끝의 슬래시를 제거한다", () => {
        expect(buildTxUrl(`${explorer}/`, "https://sepolia-rpc.giwa.io", hash))
            .toBe(`${explorer}/tx/${hash}`);
    });
});
