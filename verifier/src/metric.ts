import type {Hex} from "viem";

/**
 * 지표 구현은 V3(지표 정의 문서 6종)이 확정된 뒤에 붙인다. 데이터 출처·간격·UTC 기준·
 * 결측치 정책은 문서가 정하고, 문서 해시가 definitionHash가 된다. 문서 없는 지표는
 * 컨트랙트가 등록을 거부한다(§11.3).
 */
export interface Observation {
    /** 스케일 전 원값. 소수 문자열로 받는다 — 부동소수를 거치지 않기 위해서다 */
    raw: string;
    source: string;
    observedAt: bigint;
}

export interface MetricProvider {
    readonly metricId: Hex;
    observe(windowStart: bigint, windowEnd: bigint): Promise<Observation | undefined>;
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
