import {METRICS, scale} from "@poi/core";
import type {MetricDefinition} from "@poi/core";
import {MetricRegistry, type CandleRow, type MetricProvider, type ObserveResult} from "./metric.ts";
import {fetchClosedMinuteCandles, httpCandleFetcher, type CandleFetcher} from "./upbit.ts";

const MARKET = "KRW-BTC";
const SOURCE = "upbit:KRW-BTC:1m";

function metric(name: string): MetricDefinition {
    const definition = METRICS.find((candidate) => candidate.name === name);
    if (!definition) throw new Error(`core 지표 manifest에 없다: ${name}`);
    return definition;
}

const PRICE = metric("BTC_PRICE_KRW_AT_END");
const DRAWDOWN = metric("BTC_MAX_DRAWDOWN_IN_WINDOW");

async function candles(
    fetcher: CandleFetcher,
    windowStart: bigint,
    windowEnd: bigint,
): Promise<CandleRow[] | ObserveResult> {
    try {
        return await fetchClosedMinuteCandles({fetcher, market: MARKET, windowStart, windowEnd});
    } catch (error) {
        return {kind: "error", reason: error instanceof Error ? error.message : String(error)};
    }
}

function decimalString(value: bigint, decimals: number): string {
    const digits = value.toString().padStart(decimals + 1, "0");
    if (decimals === 0) return digits;
    const integer = digits.slice(0, -decimals);
    const fraction = digits.slice(-decimals).replace(/0+$/, "");
    return fraction ? `${integer}.${fraction}` : integer;
}

export function btcPriceKrwAtEnd(fetcher: CandleFetcher): MetricProvider {
    return {
        metricId: PRICE.metricId,
        async observe(windowStart, windowEnd) {
            const result = await candles(fetcher, windowStart, windowEnd);
            if (!Array.isArray(result)) return result;
            if (result.length === 0) {
                return {kind: "insufficient", reason: "닫힌 1분봉이 없다.", snapshot: result};
            }
            return {
                kind: "ok",
                raw: result[result.length - 1]![1],
                source: SOURCE,
                observedAt: windowEnd,
                snapshot: result,
            };
        },
    };
}

export function btcMaxDrawdownInWindow(fetcher: CandleFetcher): MetricProvider {
    return {
        metricId: DRAWDOWN.metricId,
        async observe(windowStart, windowEnd) {
            const result = await candles(fetcher, windowStart, windowEnd);
            if (!Array.isArray(result)) return result;
            if (result.length < 2) {
                return {kind: "insufficient", reason: "닫힌 1분봉이 2개 미만이다.", snapshot: result};
            }

            let peak = scale(result[0]![1], 8);
            let maximumDrop = 0n;
            const rawDecimals = DRAWDOWN.decimals + 1;
            const multiplier = 10n ** BigInt(rawDecimals + 2);
            for (const row of result) {
                const price = scale(row[1], 8);
                if (price > peak) {
                    peak = price;
                } else if (peak > 0n) {
                    const drop = (peak - price) * multiplier / peak;
                    if (drop > maximumDrop) maximumDrop = drop;
                }
            }
            return {
                kind: "ok",
                raw: decimalString(maximumDrop, rawDecimals),
                source: SOURCE,
                observedAt: windowEnd,
                snapshot: result,
            };
        },
    };
}

export function defaultProviders(fetcher: CandleFetcher = httpCandleFetcher()): MetricRegistry {
    const registry = new MetricRegistry();
    registry.register(btcPriceKrwAtEnd(fetcher));
    registry.register(btcMaxDrawdownInWindow(fetcher));
    return registry;
}
