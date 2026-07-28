import {STATE, type PoiState} from "@poi/core";

export interface StateLabel {
    seal: string;
    expanded: string;
    tone: "faint" | "ink" | "seal" | "indigo";
}

export const STATE_LABELS: Record<PoiState, StateLabel> = {
    [STATE.NOT_REQUIRED]: {seal: "해당없음", expanded: "예상 결과를 선언하지 않음", tone: "faint"},
    [STATE.PENDING]: {seal: "대기", expanded: "관측 구간 시작 전", tone: "ink"},
    [STATE.OBSERVING]: {seal: "관측중", expanded: "관측 구간 진행 중", tone: "ink"},
    [STATE.AWAITING]: {seal: "등록대기", expanded: "구간이 끝나 결과를 등록할 수 있습니다", tone: "ink"},
    [STATE.OVERDUE]: {seal: "기한초과", expanded: "유예까지 지나 등록 기한이 지났습니다", tone: "seal"},
    [STATE.SETTLED]: {seal: "등록완료", expanded: "결과가 등록됨", tone: "indigo"},
    [STATE.SETTLED_LATE]: {seal: "지연등록", expanded: "기한 후에 등록됨", tone: "indigo"},
};

export function stateLabel(state: PoiState): StateLabel {
    return STATE_LABELS[state];
}
