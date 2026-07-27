import {useState} from "react";
import type {Address, Hex} from "viem";
import {isDeployed} from "./config";
import {Decision} from "./decision";
import {Challenge} from "./challenge";
import {Note} from "./note";
import {Reveal} from "./reveal.tsx";
import {Settlement} from "./settlement";
import {Status} from "./status";
import {Wallet, ZERO_UID, type VerificationSnapshot, type WalletState} from "./wallet";

export default function App() {
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
            <h1>POI</h1>
            {!isDeployed() && (
                <p role="status">컨트랙트 미배포: 스키마 UID가 설정될 때까지 발행할 수 없습니다.</p>
            )}
            <Wallet onChange={updateWallet} />
            <Note address={address} />
            <Decision address={address} verification={verification} />
            <Settlement address={address} />
            <Challenge address={address} />
            <Status />
            <Reveal address={address} />
        </main>
    );
}
