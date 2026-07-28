import {STATE, type PoiState} from "@poi/core";

export interface StateLabel {
    seal: string;
    expanded: string;
    tone: "faint" | "ink" | "seal" | "indigo";
}

export const STATE_LABELS: Record<PoiState, StateLabel> = {
    [STATE.NOT_REQUIRED]: {seal: "해당없음", expanded: "예상 결과 없음", tone: "faint"},
    [STATE.PENDING]: {seal: "대기", expanded: "구간 시작 전", tone: "ink"},
    [STATE.OBSERVING]: {seal: "관측중", expanded: "관측 중", tone: "ink"},
    [STATE.AWAITING]: {seal: "정산대기", expanded: "정산 대기", tone: "ink"},
    [STATE.OVERDUE]: {seal: "기한초과", expanded: "정산 기한 초과", tone: "seal"},
    [STATE.SETTLED]: {seal: "정산완료", expanded: "정산됨", tone: "indigo"},
    [STATE.SETTLED_LATE]: {seal: "지연정산", expanded: "정산됨(기한 후)", tone: "indigo"},
};

export function stateLabel(state: PoiState): StateLabel {
    return STATE_LABELS[state];
}
