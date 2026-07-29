import {useState, type FormEvent} from "react";
import type {Hex} from "viem";
import {navigate} from "./router";

export function Verify() {
    const [uid, setUid] = useState("");
    const [error, setError] = useState("");
    function open(event: FormEvent) {
        event.preventDefault();
        if (!/^0x[0-9a-fA-F]{64}$/.test(uid)) {
            setError("UID는 0x로 시작하는 66자여야 합니다.");
            return;
        }
        navigate({name: "decision", uid: uid.toLowerCase() as Hex});
    }
    return <main>
        <header className="doc-header"><h1>검증하기</h1><p className="doc-note">지갑이 필요 없습니다</p></header>
        <section className="doc-section"><h2>① 증서 조회</h2><p className="doc-note">공개 대조는 결정 상세의 “공개”에서 합니다. UID를 넣으면 이동합니다.</p><form className="doc-form" onSubmit={open}>
            <div className="field"><label htmlFor="verify-uid">decisionUID</label><input className="uid" id="verify-uid" value={uid} onChange={event => setUid(event.target.value)} /></div>
            <button className="btn" type="submit">열기</button>
        </form>{error && <p className="form-status" role="alert">{error}</p>}</section>
        <section className="doc-section"><h2>② 오프체인 verifier</h2>
            <pre>$ poi-verify &lt;decisionUID&gt; --rpc &lt;url&gt; --json</pre>
            <p>종료코드 0 일치 · 1 불일치 · 2 조회 실패 · 3 검증 못 함</p>
            <p className="doc-note">verifier는 업비트에서 값을 다시 가져와 온체인 결과 등록과 대조합니다. 지표 정의는 docs/metrics/ 에 있고 그 문서 해시가 온체인 definitionHash입니다.</p>
        </section>
    </main>;
}
