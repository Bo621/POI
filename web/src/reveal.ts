import {verifyReveal, type CommitTagName} from "@poi/core";
import type {Hex} from "viem";

export interface RevealFile {
    version: "poi.reveal.v1";
    chainId: number;
    attester: Hex;
    attestationUID: Hex;
    tag: CommitTagName;
    salt: Hex;
    payload: unknown;
}

export function buildRevealFile(args: Omit<RevealFile, "version">): RevealFile {
    return {version: "poi.reveal.v1", ...args};
}

export function checkReveal(file: RevealFile, onChainCommitment: Hex): boolean {
    return verifyReveal({
        tag: file.tag,
        chainId: file.chainId,
        attester: file.attester,
        salt: file.salt,
        payload: file.payload,
    }, onChainCommitment);
}

export function revealFilename(file: Pick<RevealFile, "attestationUID" | "tag">): string {
    return `${file.attestationUID}.${file.tag}.json`;
}
