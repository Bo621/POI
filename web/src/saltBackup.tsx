import {useState} from "react";
import type {Hex} from "viem";

export interface SaltBackupState {
    confirmed: boolean;
}

export function canProceed(state: SaltBackupState): boolean {
    return state.confirmed;
}

interface Props {
    salts: Record<string, Hex>;
    payload: unknown;
    onCancel: () => void;
    onProceed: () => void;
    publishDisabled?: boolean;
    publishDisabledReason?: string;
}

export function SaltBackup({
    salts,
    payload,
    onCancel,
    onProceed,
    publishDisabled = false,
    publishDisabledReason,
}: Props) {
    const [confirmed, setConfirmed] = useState(false);
    const backup = JSON.stringify({salts, payload}, null, 2);

    async function copy() {
        await navigator.clipboard.writeText(backup);
    }

    function download() {
        const url = URL.createObjectURL(new Blob([backup], {type: "application/json"}));
        const link = document.createElement("a");
        link.href = url;
        link.download = `poi-salt-backup-${new Date().toISOString()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="modal-backdrop" role="presentation">
            <section className="modal" role="dialog" aria-modal="true" aria-labelledby="backup-title">
                <h2 id="backup-title">salt 백업</h2>
                <p className="notice">salt를 잃어버리면 이 기록은 영구히 공개할 수 없습니다. 정산에는 영향이 없습니다.</p>
                <pre>{backup}</pre>
                <div className="button-row">
                    <button className="btn" type="button" onClick={copy}>복사</button>
                    <button className="btn" type="button" onClick={download}>다운로드</button>
                </div>
                <label className="check-field" htmlFor="salt-confirmed">
                    <input
                        id="salt-confirmed"
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    저장했습니다
                </label>
                {publishDisabled && publishDisabledReason && (
                    <p className="notice notice--quiet">{publishDisabledReason}</p>
                )}
                <div className="button-row">
                    <button className="btn-quiet" type="button" onClick={onCancel}>취소</button>
                    <button className="btn-commit" type="button" disabled={publishDisabled || !canProceed({confirmed})} onClick={onProceed}>
                        발행
                    </button>
                </div>
            </section>
        </div>
    );
}
