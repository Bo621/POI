import type {PoiState} from "@poi/core";
import {stateLabel} from "./stateLabel";

export function shortUID(uid: string): string {
    return `${uid.slice(0, 10)}…${uid.slice(-6)}`;
}

export function RecordRowView({uid, state, action = "보기 →", detail, warning}: {
    uid: string;
    state: PoiState;
    action?: string;
    detail?: string;
    warning?: string;
}) {
    const label = stateLabel(state);
    return <li className="record-row">
        <span
            className={`seal seal--sm seal--${label.tone}`}
            role="img"
            aria-label={`상태: ${label.ariaLabel}`}
        >{label.seal}</span>
        <span className="hex record-row__uid">{shortUID(uid)}</span>
        <span className="record-row__detail">
            {detail}
            {warning && <span className="revocation-note">{warning}</span>}
        </span>
        <a className="btn record-row__action" href={`#/d/${uid}`}>{action}</a>
    </li>;
}
