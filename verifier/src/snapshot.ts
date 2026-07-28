import {keccak256, stringToHex, type Hex} from "viem";
import type {CandleRow} from "./metric.ts";

export function serializeSnapshot(rows: CandleRow[]): string {
    return JSON.stringify([...rows].sort((a, b) => a[0].localeCompare(b[0])));
}

export function snapshotHash(rows: CandleRow[]): Hex {
    return keccak256(stringToHex(serializeSnapshot(rows)));
}
