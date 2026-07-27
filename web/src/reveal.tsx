import {useMemo, useState} from "react";
import type {CommitTagName} from "@poi/core";
import type {Address, Hex} from "viem";
import {CHAIN} from "./config";
import {buildRevealFile, checkReveal, revealFilename} from "./reveal";

const TAGS: CommitTagName[] = ["DECISION", "TRIGGER", "EVIDENCE", "REASON"];

export function Reveal({address}: {address?: Address}) {
    const [attestationUID, setAttestationUID] = useState("");
    const [tag, setTag] = useState<CommitTagName>("DECISION");
    const [salt, setSalt] = useState("");
    const [payloadText, setPayloadText] = useState("");
    const [commitment, setCommitment] = useState("");

    const result = useMemo(() => {
        try {
            if (!address) throw new Error("먼저 지갑을 연결해 주세요.");
            if (!/^0x[0-9a-fA-F]{64}$/.test(attestationUID)) throw new Error("attestationUID를 확인해 주세요.");
            if (!/^0x[0-9a-fA-F]{32}$/.test(salt)) throw new Error("salt는 16바이트 hex여야 합니다.");
            if (!/^0x[0-9a-fA-F]{64}$/.test(commitment)) throw new Error("온체인 commitment를 확인해 주세요.");
            const payload = JSON.parse(payloadText) as unknown;
            const file = buildRevealFile({
                chainId: CHAIN.id,
                attester: address,
                attestationUID: attestationUID as Hex,
                tag,
                salt: salt as Hex,
                payload,
            });
            return checkReveal(file, commitment as Hex)
                ? {file, matches: true as const}
                : {file, matches: false as const, error: "일치하지 않습니다. salt나 payload가 다르거나 다른 사람의 commitment일 수 있습니다."};
        } catch (cause) {
            return {matches: false as const, error: cause instanceof Error ? cause.message : "입력값을 확인해 주세요."};
        }
    }, [address, attestationUID, commitment, payloadText, salt, tag]);

    function download() {
        if (!result.matches) return;
        const blob = new Blob([JSON.stringify(result.file, null, 2)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = revealFilename(result.file);
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <section>
            <h2>공개</h2>
            <p>다운로드한 파일을 저장소의 reveals/에 넣어 push하세요. 자동 업로드는 하지 않습니다.</p>
            <label>attestationUID<input value={attestationUID} onChange={(e) => setAttestationUID(e.target.value)} /></label>
            <label>항목<select value={tag} onChange={(e) => setTag(e.target.value as CommitTagName)}>
                {TAGS.map((value) => <option key={value}>{value}</option>)}
            </select></label>
            <label>salt<input value={salt} onChange={(e) => setSalt(e.target.value)} /></label>
            <label>payload (JSON)<textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} /></label>
            <label>온체인 commitment<input value={commitment} onChange={(e) => setCommitment(e.target.value)} /></label>
            <p role="status">{result.matches ? "commitment가 일치합니다." : result.error}</p>
            <button type="button" onClick={download} disabled={!result.matches}>RevealFile 다운로드</button>
        </section>
    );
}
