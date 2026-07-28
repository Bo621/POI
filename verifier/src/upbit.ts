import type {CandleRow} from "./metric.ts";

export interface RawCandle {
    candle_date_time_utc: string;
    trade_price: number | string;
}

export type CandleFetcher = (params: {
    market: string;
    to?: string;
    count: number;
}) => Promise<RawCandle[]>;

const ENDPOINT = "https://api.upbit.com/v1/candles/minutes/1";
const MAX_REQUESTS = 512;
const RETRY_DELAYS_MS = [200, 400] as const;

export function httpCandleFetcher(): CandleFetcher {
    return async (params) => {
        const url = new URL(ENDPOINT);
        url.searchParams.set("market", params.market);
        url.searchParams.set("count", String(Math.min(params.count, 200)));
        if (params.to !== undefined) url.searchParams.set("to", params.to);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`업비트 HTTP ${response.status}`);
        return await response.json() as RawCandle[];
    };
}

function parseUtcSeconds(value: string): bigint {
    const milliseconds = Date.parse(`${value}Z`);
    if (!Number.isFinite(milliseconds)) throw new Error(`잘못된 UTC 봉 시각: ${value}`);
    return BigInt(milliseconds) / 1000n;
}

function plainDecimal(value: number | string): string {
    const source = String(value);
    const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(source);
    if (!match) throw new Error(`잘못된 trade_price: ${source}`);
    const sign = match[1] === "-" ? "-" : "";
    const integer = match[2]!;
    const fraction = match[3] ?? "";
    const exponent = Number(match[4] ?? "0");
    if (!Number.isSafeInteger(exponent)) throw new Error(`trade_price 지수가 너무 크다: ${source}`);

    const digits = `${integer}${fraction}`;
    const point = integer.length + exponent;
    let expanded: string;
    if (point <= 0) {
        expanded = `0.${"0".repeat(-point)}${digits}`;
    } else if (point >= digits.length) {
        expanded = `${digits}${"0".repeat(point - digits.length)}`;
    } else {
        expanded = `${digits.slice(0, point)}.${digits.slice(point)}`;
    }
    const [whole = "0", decimal = ""] = expanded.split(".");
    const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
    const normalizedDecimal = decimal.replace(/0+$/, "");
    const normalized = normalizedDecimal ? `${normalizedWhole}.${normalizedDecimal}` : normalizedWhole;
    return normalized === "0" ? "0" : `${sign}${normalized}`;
}

async function fetchWithRetry(
    fetcher: CandleFetcher,
    params: Parameters<CandleFetcher>[0],
): Promise<RawCandle[]> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await fetcher(params);
        } catch (error) {
            lastError = error;
            const delay = RETRY_DELAYS_MS[attempt];
            if (delay !== undefined) {
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchClosedMinuteCandles(args: {
    fetcher: CandleFetcher;
    market: string;
    windowStart: bigint;
    windowEnd: bigint;
}): Promise<CandleRow[]> {
    const rows = new Map<string, CandleRow>();
    let to: string | undefined;

    for (let request = 0; request < MAX_REQUESTS; request += 1) {
        const candles = await fetchWithRetry(args.fetcher, {
            market: args.market,
            ...(to === undefined ? {} : {to}),
            count: 200,
        });
        if (candles.length === 0) {
            return [...rows.values()].sort((a, b) => a[0].localeCompare(b[0]));
        }

        let reachedStart = false;
        let oldest = candles[0]!.candle_date_time_utc;
        let oldestSeconds = parseUtcSeconds(oldest);
        for (const candle of candles) {
            const startedAt = parseUtcSeconds(candle.candle_date_time_utc);
            if (startedAt < oldestSeconds) {
                oldest = candle.candle_date_time_utc;
                oldestSeconds = startedAt;
            }
            if (startedAt < args.windowStart) reachedStart = true;
            if (startedAt >= args.windowStart && startedAt + 60n <= args.windowEnd) {
                rows.set(candle.candle_date_time_utc, [
                    candle.candle_date_time_utc,
                    plainDecimal(candle.trade_price),
                ]);
            }
        }
        if (reachedStart || candles.length < 200) {
            return [...rows.values()].sort((a, b) => a[0].localeCompare(b[0]));
        }
        to = oldest;
    }
    throw new Error(`업비트 봉 요청 상한 ${MAX_REQUESTS}회를 초과했다.`);
}
