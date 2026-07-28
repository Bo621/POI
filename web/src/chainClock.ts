import {useEffect, useState} from "react";
import {getChainTime} from "./read";

export function clockSkewNotice(skewSeconds: number | undefined): string | undefined;
export function clockSkewNotice(chainNow: bigint, browserNow: bigint): string | undefined;
export function clockSkewNotice(
    skewOrChainTime: number | bigint | undefined,
    browserNow?: bigint,
): string | undefined {
    const skewSeconds = typeof skewOrChainTime === "bigint"
        ? Number(skewOrChainTime - (browserNow ?? 0n))
        : skewOrChainTime;
    if (skewSeconds === undefined || Math.abs(skewSeconds) < 60) return undefined;
    return `기기 시각이 체인과 ${Math.abs(skewSeconds)}초 차이납니다. 표시는 체인 시각을 기준으로 합니다.`;
}

export function useChainTime(): {now: bigint | undefined; skewSeconds: number | undefined} {
    const [now, setNow] = useState<bigint>();

    useEffect(() => {
        void getChainTime().then(setNow).catch(() => undefined);
        const tick = window.setInterval(() => setNow((value) => value === undefined ? value : value + 1n), 1000);
        const sync = window.setInterval(() => {
            void getChainTime().then(setNow).catch(() => undefined);
        }, 15_000);
        return () => {
            window.clearInterval(tick);
            window.clearInterval(sync);
        };
    }, []);

    const browserNow = BigInt(Math.floor(Date.now() / 1000));
    return {
        now,
        skewSeconds: now === undefined ? undefined : Number(now - browserNow),
    };
}
