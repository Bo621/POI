import {useState} from "react";
import type {Address, Hex} from "viem";
import {CHAIN, isDeployed} from "./config";
import {useChainTime} from "./chainClock";
import {Decision} from "./decision";
import {Dag} from "./dag";
import {Challenge} from "./challenge";
import {Note} from "./note";
import {Reveal} from "./reveal.tsx";
import {Settlement} from "./settlement";
import {Status} from "./status";
import {Passport} from "./passport";
import {useRoute} from "./router";
import {DecisionDetail} from "./decisionDetail";
import {Verify} from "./verify";
import {Wallet, ZERO_UID, type VerificationSnapshot, type WalletState} from "./wallet";
import {ErrorBoundary} from "./errorBoundary";

export default function App() {
    return <ErrorBoundary label="본문"><AppRoute /></ErrorBoundary>;
}

function AppRoute() {
    const route = useRoute();
    if (route.name === "decision") return <RoutedDecision uid={route.uid} />;
    if (route.name === "verify") return <Verify />;
    if (route.name === "passport") return <main><header className="doc-header"><a href="#/">← 홈</a><h1>Strategy Passport</h1><p className="hex">{route.address}</p></header><Passport address={route.address} /></main>;
    if (route.name === "notFound") return <main><header className="doc-header"><h1>없는 화면입니다.</h1></header>
        <p>{route.raw.startsWith("#/d/") ? "UID는 0x로 시작하는 66자여야 합니다." : route.raw}</p><a href="#/">홈으로</a></main>;
    return <SinglePage />;
}

function RoutedDecision({uid}: {uid: Hex}) {
    const [address, setAddress] = useState<Address>();
    return <>
        <div className="route-wallet"><Wallet onChange={(state) => setAddress(state.address)} /></div>
        <DecisionDetail uid={uid} address={address} />
    </>;
}

function SinglePage() {
    const {now, skewSeconds} = useChainTime();
    const [address, setAddress] = useState<Address>();
    const [verification, setVerification] = useState<VerificationSnapshot>({
        verified: false,
        verifiedAddressUID: ZERO_UID as Hex,
    });

    function updateWallet(state: WalletState) {
        setAddress(state.address);
        setVerification({
            verified: state.verified,
            verifiedAddressUID: state.verifiedAddressUID,
        });
    }

    return (
        <main>
            <header className="doc-header">
                <h1>POI 판단 증서</h1>
                <p className="doc-meta">{CHAIN.name} · chainId {CHAIN.id}</p>
            </header>
            {!isDeployed() && (
                <p className="notice" role="status">컨트랙트가 아직 배포되지 않았습니다. 스키마 UID가 설정될 때까지 발행할 수 없습니다.</p>
            )}
            <Wallet onChange={updateWallet} />
            <Note address={address} />
            <Decision address={address} verification={verification} chainNow={now} skewSeconds={skewSeconds} />
            <Settlement address={address} />
            <Challenge address={address} />
            <Status now={now} skewSeconds={skewSeconds} />
            <Reveal />
            <Dag />
            <Passport />
        </main>
    );
}
