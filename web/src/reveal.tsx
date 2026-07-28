import {useEffect, useMemo, useState} from "react";
import type {CommitTagName} from "@poi/core";
import {isAddress, type Address, type Hex} from "viem";
import {CHAIN} from "./config";
import {buildRevealFile, checkReveal, revealFilename} from "./reveal";

const TAGS: CommitTagName[] = ["DECISION", "TRIGGER", "EVIDENCE", "REASON"];

export function Reveal({address}: {address?: Address}) {
    const [attester, setAttester] = useState(address ?? "");
    const [attestationUID, setAttestationUID] = useState("");
    const [tag, setTag] = useState<CommitTagName>("DECISION");
    const [salt, setSalt] = useState("");
    const [payloadText, setPayloadText] = useState("");
    const [commitment, setCommitment] = useState("");

    useEffect(() => {
        if (address) setAttester((current) => current || address);
    }, [address]);

    const result = useMemo(() => {
        try {
            if (!isAddress(attester)) throw new Error("attester 주소를 확인해 주세요.");
            if (!/^0x[0-9a-fA-F]{64}$/.test(attestationUID)) throw new Error("attestationUID를 확인해 주세요.");
            if (!/^0x[0-9a-fA-F]{32}$/.test(salt)) throw new Error("salt는 16바이트 hex여야 합니다.");
            if (!/^0x[0-9a-fA-F]{64}$/.test(commitment)) throw new Error("온체인 commitment를 확인해 주세요.");
            const payload = JSON.parse(payloadText) as unknown;
            const file = buildRevealFile({
                chainId: CHAIN.id,
                attester,
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
    }, [attester, attestationUID, commitment, payloadText, salt, tag]);

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
        <section className="doc-section">
            <h2>공개</h2>
            <p className="notice notice--quiet">다운로드한 파일을 저장소의 reveals/에 넣어 push하세요. 자동 업로드는 하지 않습니다.</p>
            <div className="doc-form">
            <div className="field"><label htmlFor="reveal-attester">attester (검증할 발행자 주소)</label><input className="hex" id="reveal-attester" value={attester} onChange={(e) => setAttester(e.target.value)} /></div>
            <div className="field"><label htmlFor="reveal-attestation">attestationUID</label><input className="uid" id="reveal-attestation" value={attestationUID} onChange={(e) => setAttestationUID(e.target.value)} /></div>
            <div className="field"><label htmlFor="reveal-tag">항목</label><select id="reveal-tag" value={tag} onChange={(e) => setTag(e.target.value as CommitTagName)}>
                {TAGS.map((value) => <option key={value}>{value}</option>)}
            </select></div>
            <div className="field"><label htmlFor="reveal-salt">salt</label><input className="hex" id="reveal-salt" value={salt} onChange={(e) => setSalt(e.target.value)} /></div>
            <div className="field"><label htmlFor="reveal-payload">payload (JSON)</label><textarea id="reveal-payload" value={payloadText} onChange={(e) => setPayloadText(e.target.value)} /></div>
            <div className="field"><label htmlFor="reveal-commitment">온체인 commitment</label><input className="uid" id="reveal-commitment" value={commitment} onChange={(e) => setCommitment(e.target.value)} /></div>
            <p className={result.matches ? "verification-result" : "form-status"} role="status">{result.matches ? "commitment가 일치합니다." : result.error}</p>
            <button className="btn" type="button" onClick={download} disabled={!result.matches}>RevealFile 다운로드</button>
            </div>
        </section>
    );
}
