import {useEffect, useState, type FormEvent} from "react";
import {encodeAbiParameters, type Address, type Hex} from "viem";
import {SCHEMAS, isDeployed} from "./config";
import {attest, revoke as revokeAttestation, type AttestResult} from "./eas";
import {readChallengeLogs, readVerified, type ChallengeLog} from "./read";
import {Receipt} from "./receipt";
import {ZERO_UID} from "./wallet";

const PARAMETERS = [
    {type: "bytes32"}, {type: "uint8"}, {type: "bool"}, {type: "int128"},
    {type: "string"}, {type: "uint64"}, {type: "bytes32"},
] as const;
const resultLabel = (result: number) => ["OBSERVED", "NOT_OBSERVED", "INDETERMINATE"][result] ?? String(result);
const short = (value: string) => `${value.slice(0, 10)}…${value.slice(-6)}`;

export function filterActiveChallenges(logs: ChallengeLog[], settlementUID: Hex): ChallengeLog[] {
    return logs.filter((log) =>
        log.refUID.toLowerCase() === settlementUID.toLowerCase() && log.revocationTime === 0n
    );
}

interface DisplayChallenge extends ChallengeLog {
    verified: boolean | "unknown";
}

export function Challenge({address, settlementUID, onSuccess}: {
    address?: Address;
    settlementUID: Hex;
    onSuccess?: () => void;
}) {
    const [claimedResult, setClaimedResult] = useState(0);
    const [hasValue, setHasValue] = useState(false);
    const [observedValue, setObservedValue] = useState("0");
    const [source, setSource] = useState("");
    const [observedAt, setObservedAt] = useState(0);
    const [noteCommitment, setNoteCommitment] = useState("");
    const [items, setItems] = useState<DisplayChallenge[]>([]);
    const [receipt, setReceipt] = useState<AttestResult>();
    const [revokeTxHash, setRevokeTxHash] = useState<Hex>();
    const [status, setStatus] = useState("");

    useEffect(() => {
        void load(settlementUID);
    }, [settlementUID]);

    async function load(targetUID = settlementUID) {
        if (!/^0x[0-9a-fA-F]{64}$/.test(targetUID)) {
            setStatus("결과 등록 UID를 확인해 주세요.");
            return;
        }
        setStatus("불러오는 중…");
        try {
            const filtered = filterActiveChallenges(
                await readChallengeLogs(SCHEMAS.challenge as Hex),
                targetUID as Hex,
            );
            // 지갑 생성 비용이 사실상 0이므로 건수·정렬·랭킹은 신뢰 신호가 될 수 없다.
            const display = await Promise.all(filtered.map(async (item) => ({
                ...item,
                verified: await readVerified(item.attester),
            })));
            setItems(display);
            setStatus(filtered.length ? "이의가 제기된 결과 등록입니다" : "조회된 활성 이의가 없습니다.");
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "이의 목록을 불러오지 못했습니다.");
        }
    }

    async function publish(event: FormEvent) {
        event.preventDefault();
        try {
            if (!address) throw new Error("먼저 지갑을 연결해 주세요.");
            if (!/^0x[0-9a-fA-F]{64}$/.test(settlementUID)) throw new Error("결과 등록 UID를 확인해 주세요.");
            const note = noteCommitment
                ? (/^0x[0-9a-fA-F]{64}$/.test(noteCommitment) ? noteCommitment as Hex : (() => { throw new Error("noteCommitment를 확인해 주세요."); })())
                : ZERO_UID;
            const data = encodeAbiParameters(PARAMETERS, [
                settlementUID as Hex, claimedResult, hasValue,
                hasValue ? BigInt(observedValue) : 0n, source, BigInt(observedAt), note,
            ]);
            const result = await attest({
                schema: SCHEMAS.challenge as Hex,
                data,
                revocable: true,
                refUID: settlementUID as Hex,
            });
            setReceipt(result);
            await load();
            onSuccess?.();
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "이의 발행에 실패했습니다.");
        }
    }

    async function revoke(uid: Hex) {
        try {
            const result = await revokeAttestation({schema: SCHEMAS.challenge as Hex, uid});
            setRevokeTxHash(result.txHash);
            await load();
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "이의 철회에 실패했습니다.");
        }
    }

    return (
        <section className="doc-section">
            <h3>이의</h3>
            <p className="notice notice--quiet">조회된 것이 전부라는 보장은 없습니다.</p>
            <form className="doc-form" onSubmit={publish}>
                <div className="field"><label htmlFor="challenge-result">claimedResult</label><select id="challenge-result" value={claimedResult} onChange={(e) => setClaimedResult(Number(e.target.value))}>
                    <option value={0}>OBSERVED</option><option value={1}>NOT_OBSERVED</option><option value={2}>INDETERMINATE</option>
                </select></div>
                <label className="check-field" htmlFor="challenge-has-value"><input id="challenge-has-value" type="checkbox" checked={hasValue} onChange={(e) => setHasValue(e.target.checked)} />관측값 있음</label>
                {hasValue && <div className="field"><label htmlFor="challenge-value">관측값(정수)</label><input id="challenge-value" value={observedValue} onChange={(e) => setObservedValue(e.target.value)} /></div>}
                <div className="field"><label htmlFor="challenge-source">출처</label><input id="challenge-source" value={source} onChange={(e) => setSource(e.target.value)} /></div>
                <div className="field"><label htmlFor="challenge-observed-at">observedAt (Unix 초)</label><input id="challenge-observed-at" type="number" value={observedAt} onChange={(e) => setObservedAt(Number(e.target.value))} /></div>
                <div className="field"><label htmlFor="challenge-note">noteCommitment (선택)</label><input className="uid" id="challenge-note" value={noteCommitment} onChange={(e) => setNoteCommitment(e.target.value)} /></div>
                {!address && <p className="notice notice--quiet">지갑을 연결해야 이의를 발행할 수 있습니다.</p>}
                <div className="button-row">
                    <button className="btn-commit" type="submit" disabled={!address || !isDeployed()}>이의 발행</button>
                </div>
            </form>
            {status && <p className="form-status" role="status">{status}</p>}
            <Receipt label="이의" uid={receipt?.uid} txHash={receipt?.txHash} />
            <Receipt label="이의 철회" txHash={revokeTxHash} />
            <ul className="record-list">
                {items.map((item) => (
                    <li className="challenge-row" key={item.uid}>
                        <span className="hex" title={item.uid}>{short(item.uid)}</span>
                        <span><span className="hex" title={item.attester}>{short(item.attester)}</span> · {item.verified === true ? "검증 지갑" : item.verified === false ? "미검증 지갑" : "확인 불가"}</span>
                        <span>{resultLabel(item.claimedResult)}</span>
                        <span>{item.hasObservedValue ? item.observedValue.toString() : "관측값 없음"}</span>
                        <span>{item.source}</span>
                        {address?.toLowerCase() === item.attester.toLowerCase() && <button className="btn-quiet" type="button" onClick={() => revoke(item.uid)}>내 이의 철회</button>}
                    </li>
                ))}
            </ul>
        </section>
    );
}
