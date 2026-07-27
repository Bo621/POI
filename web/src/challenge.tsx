import {useState, type FormEvent} from "react";
import {encodeAbiParameters, parseAbi, type Address, type Hex} from "viem";
import {getWalletClient} from "./chain";
import {EAS_ADDRESS, SCHEMAS, isDeployed} from "./config";
import {attest} from "./eas";
import {readChallengeLogs, readVerified, type ChallengeLog} from "./read";
import {ZERO_UID} from "./wallet";

const PARAMETERS = [
    {type: "bytes32"}, {type: "uint8"}, {type: "bool"}, {type: "int128"},
    {type: "string"}, {type: "uint64"}, {type: "bytes32"},
] as const;
const REVOKE_ABI = parseAbi([
    "function revoke((bytes32 schema,(bytes32 uid,uint256 value) data) request) payable",
]);

export function filterActiveChallenges(logs: ChallengeLog[], settlementUID: Hex): ChallengeLog[] {
    return logs.filter((log) =>
        log.refUID.toLowerCase() === settlementUID.toLowerCase() && log.revocationTime === 0n
    );
}

interface DisplayChallenge extends ChallengeLog {
    verified: boolean | "unknown";
}

export function Challenge({address}: {address?: Address}) {
    const [settlementUID, setSettlementUID] = useState("");
    const [claimedResult, setClaimedResult] = useState(0);
    const [hasValue, setHasValue] = useState(false);
    const [observedValue, setObservedValue] = useState("0");
    const [source, setSource] = useState("");
    const [observedAt, setObservedAt] = useState(0);
    const [noteCommitment, setNoteCommitment] = useState("");
    const [items, setItems] = useState<DisplayChallenge[]>([]);
    const [status, setStatus] = useState("");

    async function load() {
        if (!/^0x[0-9a-fA-F]{64}$/.test(settlementUID)) {
            setStatus("정산 UID를 확인해 주세요.");
            return;
        }
        try {
            const filtered = filterActiveChallenges(
                await readChallengeLogs(SCHEMAS.challenge as Hex),
                settlementUID as Hex,
            );
            // 지갑 생성 비용이 사실상 0이므로 건수·정렬·랭킹은 신뢰 신호가 될 수 없다.
            const display = await Promise.all(filtered.map(async (item) => ({
                ...item,
                verified: await readVerified(item.attester),
            })));
            setItems(display);
            setStatus(filtered.length ? "이의가 제기된 정산입니다" : "조회된 활성 이의가 없습니다.");
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "이의 목록을 불러오지 못했습니다.");
        }
    }

    async function publish(event: FormEvent) {
        event.preventDefault();
        try {
            if (!address) throw new Error("먼저 지갑을 연결해 주세요.");
            if (!/^0x[0-9a-fA-F]{64}$/.test(settlementUID)) throw new Error("정산 UID를 확인해 주세요.");
            const note = noteCommitment
                ? (/^0x[0-9a-fA-F]{64}$/.test(noteCommitment) ? noteCommitment as Hex : (() => { throw new Error("noteCommitment를 확인해 주세요."); })())
                : ZERO_UID;
            const data = encodeAbiParameters(PARAMETERS, [
                settlementUID as Hex, claimedResult, hasValue,
                hasValue ? BigInt(observedValue) : 0n, source, BigInt(observedAt), note,
            ]);
            const hash = await attest({
                schema: SCHEMAS.challenge as Hex,
                data,
                revocable: true,
                refUID: settlementUID as Hex,
            });
            setStatus(`이의 발행 트랜잭션: ${hash}`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "이의 발행에 실패했습니다.");
        }
    }

    async function revoke(uid: Hex) {
        try {
            const wallet = getWalletClient();
            const [account] = await wallet.requestAddresses();
            const hash = await wallet.writeContract({
                address: EAS_ADDRESS as Address,
                abi: REVOKE_ABI,
                functionName: "revoke",
                account,
                args: [{schema: SCHEMAS.challenge as Hex, data: {uid, value: 0n}}],
                value: 0n,
            });
            setStatus(`이의 철회 트랜잭션: ${hash}`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "이의 철회에 실패했습니다.");
        }
    }

    return (
        <section>
            <h2>이의</h2>
            <p>조회된 것이 전부라는 보장은 없습니다.</p>
            <form onSubmit={publish}>
                <label>settlementUID<input value={settlementUID} onChange={(e) => setSettlementUID(e.target.value)} /></label>
                <label>claimedResult<select value={claimedResult} onChange={(e) => setClaimedResult(Number(e.target.value))}>
                    <option value={0}>OBSERVED</option><option value={1}>NOT_OBSERVED</option><option value={2}>INDETERMINATE</option>
                </select></label>
                <label><input type="checkbox" checked={hasValue} onChange={(e) => setHasValue(e.target.checked)} />관측값 있음</label>
                {hasValue && <label>관측값(정수)<input value={observedValue} onChange={(e) => setObservedValue(e.target.value)} /></label>}
                <label>출처<input value={source} onChange={(e) => setSource(e.target.value)} /></label>
                <label>observedAt (Unix 초)<input type="number" value={observedAt} onChange={(e) => setObservedAt(Number(e.target.value))} /></label>
                <label>noteCommitment (선택)<input value={noteCommitment} onChange={(e) => setNoteCommitment(e.target.value)} /></label>
                <button type="submit" disabled={!isDeployed()}>이의 발행</button>
                <button type="button" onClick={load} disabled={!isDeployed()}>목록 조회</button>
            </form>
            {status && <p role="status">{status}</p>}
            <ul>
                {items.map((item) => (
                    <li key={item.uid}>
                        <span>{item.uid} · {item.verified === true ? "검증 지갑" : item.verified === false ? "미검증 지갑" : "확인 불가"}</span>
                        {address?.toLowerCase() === item.attester.toLowerCase() && <button type="button" onClick={() => revoke(item.uid)}>내 이의 철회</button>}
                    </li>
                ))}
            </ul>
        </section>
    );
}
