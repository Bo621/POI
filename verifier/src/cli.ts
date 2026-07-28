#!/usr/bin/env node
import {isHex, type Hex} from "viem";
import {requiredAddress} from "./env.ts";
import {defaultProviders} from "./providers.ts";
import {createViemReader} from "./reader.ts";
import {VERDICT, verifyDecision} from "./verify.ts";

const USAGE = "사용법: poi-verify <decisionUID> [--rpc <url>] [--json] [--no-fetch]";

export async function main(argv = process.argv.slice(2)): Promise<number> {
    let rpcUrl = process.env.POI_RPC_URL;
    let json = false;
    let noFetch = false;
    let decisionUID: Hex | undefined;
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]!;
        if (arg === "--json") {
            json = true;
        } else if (arg === "--no-fetch") {
            noFetch = true;
        } else if (arg === "--rpc") {
            rpcUrl = argv[++index];
            if (!rpcUrl) throw new Error(USAGE);
        } else if (!decisionUID && isHex(arg) && arg.length === 66) {
            decisionUID = arg;
        } else {
            throw new Error(USAGE);
        }
    }
    if (!decisionUID || !rpcUrl) throw new Error(USAGE);

    const reader = createViemReader({
        rpcUrl,
        easAddress: requiredAddress("POI_EAS_ADDRESS"),
        settlementResolverAddress: requiredAddress("POI_SETTLEMENT_RESOLVER_ADDRESS"),
        metricRegistryAddress: requiredAddress("POI_METRIC_REGISTRY_ADDRESS"),
    });
    const report = await verifyDecision({
        reader,
        ...(!noFetch && {metrics: defaultProviders()}),
        decisionUID,
        now: await reader.getChainTime(),
    });
    if (json) {
        console.log(JSON.stringify(report, (_key, value) =>
            typeof value === "bigint" ? value.toString() : value, 2));
    } else {
        console.log(`판정: ${report.verdict}`);
        console.log(`상태: ${report.state}`);
        for (const problem of report.problems) console.log(`문제: ${problem}`);
    }
    if (report.verdict === VERDICT.MISMATCH) return 1;
    if (report.verdict === VERDICT.NO_OBSERVATION || report.verdict === VERDICT.NO_SETTLEMENT) return 3;
    return 0;
}

main().then(
    (code) => process.exit(code),
    (error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(2);
    },
);
