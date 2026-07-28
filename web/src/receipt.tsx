import type {Hex} from "viem";
import {CHAIN, EXPLORER_URL, isLocalChain} from "./config";

export function buildTxUrl(explorerUrl: string, rpcUrl: string, hash: string): string | undefined {
    if (/(?:127\.0\.0\.1|localhost)/i.test(rpcUrl)) return undefined;
    return `${explorerUrl.replace(/\/+$/, "")}/tx/${hash}`;
}

export function txUrl(txHash: Hex): string | undefined {
    return buildTxUrl(EXPLORER_URL, CHAIN.rpcUrl, txHash);
}

export function attestationUrl(_uid: Hex): string | undefined {
    return undefined;
}

export function Receipt(props: {label: string; uid?: Hex; txHash?: Hex}): JSX.Element | null {
    if (!props.uid && !props.txHash) return null;
    const transactionUrl = props.txHash ? txUrl(props.txHash) : undefined;

    return (
        <>
            <dl className="doc-fields">
                <dt>발행</dt><dd>{props.label}</dd>
                {props.uid && <><dt>UID</dt><dd className="hex">{props.uid}</dd></>}
                {props.txHash && (
                    <>
                        <dt>트랜잭션</dt>
                        <dd className="hex">
                            {transactionUrl
                                ? <a href={transactionUrl} target="_blank" rel="noopener noreferrer">{props.txHash}</a>
                                : props.txHash}
                        </dd>
                    </>
                )}
            </dl>
            {isLocalChain() && <p className="doc-note">로컬 체인이라 익스플로러 링크가 없습니다.</p>}
        </>
    );
}
