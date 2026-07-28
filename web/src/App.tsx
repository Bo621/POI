import {useCallback, useEffect, useState} from "react";
import type {Address, Hex} from "viem";
import {isDeployed} from "./config";
import {useChainTime} from "./chainClock";
import {Decision} from "./decision";
import {Note} from "./note";
import {Passport} from "./passport";
import {navigate, useRoute} from "./router";
import {DecisionDetail} from "./decisionDetail";
import {Verify} from "./verify";
import {ZERO_UID, type WalletState} from "./wallet";
import {ErrorBoundary} from "./errorBoundary";
import {loadRecords, needsAction, type RecordRow} from "./records";
import {Nav} from "./nav";
import {Home} from "./home";
import {RecordRowView} from "./recordRow";

export default function App() {
    return <ErrorBoundary label="본문"><AppRoute /></ErrorBoundary>;
}

function AppRoute() {
    const route = useRoute();
    const [wallet, setWallet] = useState<WalletState>({
        verified: false,
        verifiedAddressUID: ZERO_UID as Hex,
    });
    let page;
    if (route.name === "decision") page = <DecisionDetail uid={route.uid} address={wallet.address} />;
    else if (route.name === "verify") page = <Verify />;
    else if (route.name === "passport") page = <main><header className="doc-header"><a href="#/">← 홈</a><h1>Strategy Passport</h1><p className="hex">{route.address}</p></header><Passport address={route.address} /></main>;
    else if (route.name === "record") page = <RecordPage wallet={wallet} />;
    else if (route.name === "me") page = <MePage address={wallet.address} />;
    else if (route.name === "notFound") page = <main><header className="doc-header"><h1>없는 화면입니다.</h1></header>
        <p>{route.raw.startsWith("#/d/") ? "UID는 0x로 시작하는 66자여야 합니다." : route.raw}</p><a href="#/">홈으로</a></main>;
    else page = <Home address={wallet.address} />;
    return <><Nav route={route} wallet={wallet} onWalletChange={setWallet} />{page}</>;
}

function PageHeader({title}: {title: string}) {
    return <header className="doc-header">
        <a href="#/">← 홈</a>
        <h1>{title}</h1>
    </header>;
}

function RecordPage({wallet}: {wallet: WalletState}) {
    const {now, skewSeconds} = useChainTime();
    const [journalCount, setJournalCount] = useState(0);
    const [notePublished, setNotePublished] = useState(false);
    const [decisionEditing, setDecisionEditing] = useState(false);
    const onNoteProgress = useCallback((progress: {journalCount: number; notePublished: boolean}) => {
        setJournalCount(progress.journalCount);
        setNotePublished(progress.notePublished);
    }, []);
    const activeStep = decisionEditing ? 3 : notePublished ? 2 : 1;

    return <main>
        <PageHeader title="기록하기" />
        <ol className="record-progress" aria-label="기록 단계">
            <li aria-current={activeStep === 1 ? "step" : undefined}><strong>① 저널</strong><span>{journalCount > 0 ? "저장됨" : "검증 안 됨"}</span></li>
            <li aria-current={activeStep === 2 ? "step" : undefined}><strong>② 노트</strong><span>시점 고정</span></li>
            <li aria-current={activeStep === 3 ? "step" : undefined}><strong>③ 결정</strong><span>시점 + 예상 결과 고정</span></li>
        </ol>
        {!isDeployed() && <p className="notice" role="status">컨트랙트가 아직 배포되지 않았습니다. 스키마 UID가 설정될 때까지 발행할 수 없습니다.</p>}
        <Note address={wallet.address} onProgressChange={onNoteProgress} />
        <Decision
            address={wallet.address}
            verification={wallet}
            chainNow={now}
            skewSeconds={skewSeconds}
            onPublished={(uid) => navigate({name: "decision", uid})}
            onEditingChange={setDecisionEditing}
        />
    </main>;
}

function RecordRows({rows}: {rows: RecordRow[]}) {
    if (rows.length === 0) return <p className="doc-note">표시할 기록이 없습니다.</p>;
    return <ul className="record-list">
        {rows.map((row) => <RecordRowView
            key={row.uid}
            uid={row.uid}
            state={row.state}
            action={row.state === "AWAITING" ? "정산하기 →" : "보기 →"}
            detail={`${new Date(Number(row.committedAt) * 1000).toLocaleString("ko-KR")} · ${row.grade}`}
            warning={row.hasRevoked ? "정산 철회 이력 있음" : undefined}
        />)}
    </ul>;
}

function MePage({address}: {address?: Address}) {
    const [rows, setRows] = useState<RecordRow[]>();
    const [error, setError] = useState("");

    useEffect(() => {
        if (!address) {
            setRows(undefined);
            return;
        }
        let active = true;
        setError("");
        void loadRecords(address)
            .then((loaded) => { if (active) setRows(loaded); })
            .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "기록을 불러오지 못했습니다."); });
        return () => { active = false; };
    }, [address]);

    return <main>
        <PageHeader title="내 기록" />
        {!address && <p className="notice notice--quiet">지갑을 연결하면 내 기록을 불러옵니다.</p>}
        {address && <p className="hex">{address}</p>}
        {rows && <>
            <section className="doc-section">
                <h2>지금 할 일</h2>
                <RecordRows rows={needsAction(rows)} />
            </section>
            <section className="doc-section">
                <h2>전체</h2>
                <RecordRows rows={rows} />
            </section>
            <p className="notice notice--quiet">조회된 것이 전부라는 보장은 없습니다.</p>
        </>}
        {error && <p className="form-status" role="alert">{error}</p>}
    </main>;
}
