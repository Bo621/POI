import {STATE, type PoiState} from "@poi/core";

export {clockSkewNotice} from "./chainClock";

export function describeState(state: PoiState): string {
    const labels: Record<PoiState, string> = {
        [STATE.NOT_REQUIRED]: "예상 결과 없음",
        [STATE.PENDING]: "구간 시작 전",
        [STATE.OBSERVING]: "관측 중",
        [STATE.AWAITING]: "정산 대기",
        [STATE.OVERDUE]: "정산 기한 초과",
        [STATE.SETTLED]: "정산됨",
        [STATE.SETTLED_LATE]: "정산됨(기한 후)",
    };
    return labels[state];
}
