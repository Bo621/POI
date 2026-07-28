#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import {isHex, type Hex} from "viem";
import {requiredAddress} from "./env.ts";
import {createViemReader} from "./reader.ts";
import {
    REVEAL,
    revealDecision,
    revealExitCode,
    type DecisionCommitTag,
} from "./reveal.ts";

const USAGE = "사용법: poi-reveal <decisionUID> --salt <hex> --payload <파일|-> [--tag TAG] [--rpc <url>] [--json]";
const TAGS = new Set<DecisionCommitTag>(["DECISION", "TRIGGER", "EVIDENCE", "REASON"]);

async function readPayload(path: string): Promise<unknown> {
    const source = path === "-"
        ? await new Promise<string>((resolve, reject) => {
            let input = "";
            process.stdin.setEncoding("utf8");
            process.stdin.on("data", (chunk) => { input += chunk; });
            process.stdin.on("end", () => resolve(input));
            process.stdin.on("error", reject);
        })
        : await readFile(path, "utf8");
    return JSON.parse(source);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
    let rpcUrl = process.env.POI_RPC_URL;
    let json = false;
    let decisionUID: Hex | undefined;
    let salt: Hex | undefined;
    let payloadPath: string | undefined;
    let tag: DecisionCommitTag = "DECISION";

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]!;
        if (arg === "--json") {
            json = true;
        } else if (arg === "--rpc") {
            rpcUrl = argv[++index];
            if (!rpcUrl) throw new Error(USAGE);
        } else if (arg === "--salt") {
            const value = argv[++index];
            if (!value) throw new Error(USAGE);
            salt = value as Hex;
        } else if (arg === "--payload") {
            payloadPath = argv[++index];
            if (!payloadPath) throw new Error(USAGE);
        } else if (arg === "--tag") {
            const value = argv[++index];
            if (!value || !TAGS.has(value as DecisionCommitTag)) throw new Error(USAGE);
            tag = value as DecisionCommitTag;
        } else if (!decisionUID && isHex(arg) && arg.length === 66) {
            decisionUID = arg;
        } else {
            throw new Error(USAGE);
        }
    }
    if (!decisionUID || !salt || !payloadPath || !rpcUrl) throw new Error(USAGE);

    const payload = await readPayload(payloadPath);
    const reader = createViemReader({
        rpcUrl,
        easAddress: requiredAddress("POI_EAS_ADDRESS"),
    });
    const report = revealDecision({
        decision: await reader.getDecision(decisionUID),
        decisionUID,
        tag,
        chainId: await reader.getChainId(),
        salt,
        payload,
    });

    if (json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(`판정: ${report.verdict}`);
        console.log(`tag: ${report.tag}`);
        console.log(`attester: ${report.attester}`);
        console.log(`온체인 commitment: ${report.onChainCommitment}`);
        console.log(`재계산 commitment: ${report.computedCommitment ?? "-"}`);
        if (report.verdict === REVEAL.MISMATCH) {
            console.log("salt나 payload가 다르거나 다른 사람의 commitment 복사본일 수 있습니다");
        }
    }
    return revealExitCode(report);
}

main().then(
    (code) => process.exit(code),
    (error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(2);
    },
);
