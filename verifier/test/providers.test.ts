import assert from "node:assert/strict";
import test from "node:test";
import {METRICS, scale} from "@poi/core";
import {
    btcMaxDrawdownInWindow,
    btcPriceKrwAtEnd,
} from "../src/providers.ts";
import type {CandleFetcher, RawCandle} from "../src/upbit.ts";

const START = BigInt(Date.parse("2026-07-28T00:00:00Z") / 1000);
const END = START + 300n;

function fetcher(prices: string[]): CandleFetcher {
    const candles: RawCandle[] = prices.map((price, index) => ({
        candle_date_time_utc: `2026-07-28T00:0${index}:00`,
        trade_price: price,
    })).reverse();
    return async () => candles;
}

test("price returns the latest closed candle", async () => {
    const result = await btcPriceKrwAtEnd(fetcher(["100", "101", "102"])).observe(START, END);
    assert.equal(result.kind, "ok");
    if (result.kind === "ok") assert.equal(result.raw, "102");
});

test("price is insufficient with no candles", async () => {
    assert.equal((await btcPriceKrwAtEnd(async () => []).observe(START, END)).kind, "insufficient");
});

async function drawdown(prices: string[]): Promise<string> {
    const result = await btcMaxDrawdownInWindow(fetcher(prices)).observe(START, END);
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") throw new Error("expected observation");
    return result.raw;
}

test("drawdown is zero for a rising series", async () => {
    assert.equal(await drawdown(["100", "101", "102"]), "0");
});

test("drawdown uses the running peak", async () => {
    assert.equal(await drawdown(["100", "95", "98"]), "5");
});

test("drawdown follows a new peak", async () => {
    assert.equal(await drawdown(["100", "90", "120", "108"]), "10");
});

test("drawdown is insufficient with one candle", async () => {
    assert.equal(
        (await btcMaxDrawdownInWindow(fetcher(["100"])).observe(START, END)).kind,
        "insufficient",
    );
});

test("drawdown preserves a half-up guard digit", async () => {
    const raw = await drawdown(["10000", "9765"]);
    assert.equal(raw, "2.35");
    assert.equal(scale(raw, 1), 24n);
});

test("drawdown avoids a floating-point rounding trap", async () => {
    assert.equal(await drawdown(["9007199254740993", "8785932433049513"]), "2.45");
});

test("provider metricIds come from the core manifest", () => {
    assert.equal(btcPriceKrwAtEnd(fetcher([])).metricId, METRICS[0]!.metricId);
    assert.equal(btcMaxDrawdownInWindow(fetcher([])).metricId, METRICS[1]!.metricId);
});

test("fetch failure is an error result", async () => {
    const failure: CandleFetcher = async () => { throw new Error("offline"); };
    assert.equal((await btcPriceKrwAtEnd(failure).observe(START, END)).kind, "error");
});
