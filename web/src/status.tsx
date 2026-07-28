import type {PoiState} from "@poi/core";
import {stateLabel} from "./stateLabel";

export {clockSkewNotice} from "./chainClock";

export function describeState(state: PoiState): string {
    return stateLabel(state).expanded;
}
