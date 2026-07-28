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
import {Wallet, ZERO_UID, type VerificationSnapshot, type WalletState} from "./wallet";

export default function App() {
    const route = useRoute();
    void route;
    return <SinglePage />;
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
