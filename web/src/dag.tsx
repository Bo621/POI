import {useState, type FormEvent} from "react";
import type {Hex} from "viem";
import {buildDag, type DagResult} from "./graph";
import {readDecision} from "./read";

function short(value: Hex): string {
    return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function timeLabel(value: bigint): string {
    return new Date(Number(value) * 1000).toLocaleString("ko-KR");
}

export function Dag() {
    const [decisionUID, setDecisionUID] = useState("");
    const [result, setResult] = useState<DagResult>();
    const [error, setError] = useState("");

    async function load(event: FormEvent) {
        event.preventDefault();
        setError("");
        try {
            if (!/^0x[0-9a-fA-F]{64}$/.test(decisionUID)) throw new Error("결정 UID를 확인해 주세요.");
            setResult(await buildDag(decisionUID as Hex, async (uid) => {
                try {
                    const decision = await readDecision(uid);
                    return {attester: decision.attester, time: decision.time, parents: decision.parents};
                } catch {
                    return undefined;
                }
            }));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "DAG를 불러오지 못했습니다.");
        }
    }

    return (
        <section className="doc-section">
            <h2>결정 DAG 조회</h2>
            <form className="doc-form" onSubmit={load}>
                <div className="field">
                    <label htmlFor="dag-decision">decisionUID</label>
                    <input className="uid" id="dag-decision" value={decisionUID} onChange={(event) => setDecisionUID(event.target.value)} />
                </div>
                <button className="btn" type="submit">부모 기록 조회</button>
            </form>
            <p className="notice--quiet">조회된 것이 전부라는 보장은 없습니다.</p>
            {result?.truncated && <p className="notice--quiet">노드 상한에 도달해 일부만 표시합니다.</p>}
            {result?.nodes.map((node) => (
                <div key={node.uid} style={{paddingInlineStart: `calc(${node.depth} * 1.25rem)`}}>
                    {node.missing ? (
                        <p className="doc-note"><span className="hex">{short(node.uid)}</span> · 조회하지 못했습니다</p>
                    ) : (
                        <dl className="doc-fields">
                            <dt>UID</dt><dd className="hex">{short(node.uid)}</dd>
                            <dt>attester</dt><dd className="hex">{short(node.attester)}</dd>
                            <dt>시각</dt><dd className="hex">{timeLabel(node.time)}</dd>
                            <dt>부모</dt><dd>{node.parents.length}</dd>
                        </dl>
                    )}
                </div>
            ))}
            {error && <p className="form-status" role="alert">{error}</p>}
        </section>
    );
}
