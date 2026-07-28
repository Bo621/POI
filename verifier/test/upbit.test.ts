import assert from "node:assert/strict";
import test from "node:test";
import type {CandleFetcher, RawCandle} from "../src/upbit.ts";
import {fetchClosedMinuteCandles} from "../src/upbit.ts";

const BASE_MS = Date.parse("2026-07-28T00:00:00Z");
const seconds = (minute: number): bigint => BigInt(BASE_MS / 1000 + minute * 60);
const candle = (minute: number, price: number | string = 100): RawCandle => ({
    candle_date_time_utc: new Date(BASE_MS + minute * 60_000).toISOString().slice(0, 19),
    trade_price: price,
});
const fixed = (candles: RawCandle[]): CandleFetcher => async () => candles;

test("candles before the window and candles not fully closed are excluded", async () => {
    const rows = await fetchClosedMinuteCandles({
        fetcher: fixed([candle(3), candle(2), candle(1), candle(0)]),
        market: "KRW-BTC",
        windowStart: seconds(1),
        windowEnd: seconds(3),
    });
    assert.deepEqual(rows.map((row) => row[0]), [
        candle(1).candle_date_time_utc,
        candle(2).candle_date_time_utc,
    ]);
});

test("a candle closing exactly at windowEnd is included", async () => {
    const rows = await fetchClosedMinuteCandles({
        fetcher: fixed([candle(2)]),
        market: "KRW-BTC",
        windowStart: seconds(0),
        windowEnd: seconds(3),
    });
    assert.equal(rows.length, 1);
});

test("a candle closing after windowEnd is excluded", async () => {
    const rows = await fetchClosedMinuteCandles({
        fetcher: fixed([candle(3)]),
        market: "KRW-BTC",
        windowStart: seconds(0),
        windowEnd: seconds(3),
    });
    assert.equal(rows.length, 0);
});

test("pagination joins two 200-candle pages", async () => {
    const all = Array.from({length: 400}, (_, index) => candle(index));
    let calls = 0;
    const fetcher: CandleFetcher = async () => {
        calls += 1;
        return calls === 1 ? all.slice(200).reverse() : all.slice(0, 200).reverse();
    };
    const rows = await fetchClosedMinuteCandles({
        fetcher,
        market: "KRW-BTC",
        windowStart: seconds(1),
        windowEnd: seconds(400),
    });
    assert.equal(calls, 2);
    assert.equal(rows.length, 399);
});

test("a duplicate at a page boundary is removed", async () => {
    const newest = Array.from({length: 200}, (_, index) => candle(index + 200));
    const older = [candle(200), ...Array.from({length: 199}, (_, index) => candle(index + 1))];
    let calls = 0;
    const rows = await fetchClosedMinuteCandles({
        fetcher: async () => (++calls === 1 ? newest.reverse() : older),
        market: "KRW-BTC",
        windowStart: seconds(2),
        windowEnd: seconds(400),
    });
    assert.equal(new Set(rows.map((row) => row[0])).size, rows.length);
});

test("UTC candle timestamps are parsed independently of the local timezone", async () => {
    const rows = await fetchClosedMinuteCandles({
        fetcher: fixed([{candle_date_time_utc: "2026-07-28T00:25:00", trade_price: 1}]),
        market: "KRW-BTC",
        windowStart: BigInt(Date.parse("2026-07-28T00:25:00Z") / 1000),
        windowEnd: BigInt(Date.parse("2026-07-28T00:26:00Z") / 1000),
    });
    assert.equal(rows.length, 1);
});

test("trade prices are normalized without trailing zeroes", async () => {
    const rows = await fetchClosedMinuteCandles({
        fetcher: fixed([candle(1, "0.00012300"), candle(0, "92999000.00000000")]),
        market: "KRW-BTC",
        windowStart: seconds(0),
        windowEnd: seconds(2),
    });
    assert.deepEqual(rows.map((row) => row[1]), ["92999000", "0.000123"]);
});

test("fetch retries twice and then succeeds, but throws after three failures", async () => {
    let attempts = 0;
    const succeeds: CandleFetcher = async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("temporary");
        return [candle(0)];
    };
    assert.equal((await fetchClosedMinuteCandles({
        fetcher: succeeds,
        market: "KRW-BTC",
        windowStart: seconds(0),
        windowEnd: seconds(1),
    })).length, 1);
    assert.equal(attempts, 3);

    attempts = 0;
    await assert.rejects(() => fetchClosedMinuteCandles({
        fetcher: async () => {
            attempts += 1;
            throw new Error("offline");
        },
        market: "KRW-BTC",
        windowStart: seconds(0),
        windowEnd: seconds(1),
    }), /offline/);
    assert.equal(attempts, 3);
});

test("the request cap prevents an infinite pagination loop", async () => {
    const page = Array.from({length: 200}, (_, index) => candle(index + 1)).reverse();
    await assert.rejects(() => fetchClosedMinuteCandles({
        fetcher: fixed(page),
        market: "KRW-BTC",
        windowStart: 0n,
        windowEnd: seconds(1000),
    }), /요청 상한/);
});
