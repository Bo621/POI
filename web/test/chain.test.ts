import {describe, expect, it, vi} from "vitest";
import {withRetry} from "../src/chain";

describe("withRetry", () => {
    it("두 번 실패한 뒤 세 번째 결과를 반환한다", async () => {
        vi.useFakeTimers();
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error("one"))
            .mockRejectedValueOnce(new Error("two"))
            .mockResolvedValue("ok");
        const result = withRetry(fn);
        await vi.runAllTimersAsync();
        await expect(result).resolves.toBe("ok");
        expect(fn).toHaveBeenCalledTimes(3);
        vi.useRealTimers();
    });

    it("세 번 모두 실패하면 마지막 오류를 던진다", async () => {
        vi.useFakeTimers();
        const last = new Error("last");
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error("one"))
            .mockRejectedValueOnce(new Error("two"))
            .mockRejectedValueOnce(last);
        const result = withRetry(fn);
        const assertion = expect(result).rejects.toBe(last);
        await vi.runAllTimersAsync();
        await assertion;
        expect(fn).toHaveBeenCalledTimes(3);
        vi.useRealTimers();
    });
});
