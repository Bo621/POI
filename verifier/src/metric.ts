import type {Hex} from "viem";

export type CandleRow = readonly [string, string];

export type ObserveResult =
    | {kind: "ok"; raw: string; source: string; observedAt: bigint; snapshot: CandleRow[]}
    | {kind: "insufficient"; reason: string; snapshot: CandleRow[]}
    | {kind: "error"; reason: string};

export interface MetricProvider {
    readonly metricId: Hex;
    observe(windowStart: bigint, windowEnd: bigint): Promise<ObserveResult>;
}

export class MetricRegistry {
    readonly #providers = new Map<string, MetricProvider>();

    register(provider: MetricProvider): void {
        this.#providers.set(provider.metricId.toLowerCase(), provider);
    }

    get(metricId: Hex): MetricProvider | undefined {
        return this.#providers.get(metricId.toLowerCase());
    }
}
