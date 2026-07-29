#!/usr/bin/env node
import {pathToFileURL} from "node:url";
import {isHex, type Hex} from "viem";
import {requiredAddress, requiredSchemaUID} from "./env.ts";
import {defaultProviders} from "./providers.ts";
import {createViemReader} from "./reader.ts";
import {VERDICT, verifyDecision} from "./verify.ts";

/**
 * 종료코드는 문서(gitbook/verify/exit-codes.md)가 정의한 계약이다.
 * `NOT_REQUIRED`(예상 결과 미선언)는 **검증할 대상이 없는 것**이므로 3 이다 —
 * 0 으로 두면 「검증됨」과 구별되지 않는다.
 */
export function exitCodeFor(verdict: string): number {
    if (verdict === VERDICT.MISMATCH) return 1;
    if (verdict === VERDICT.NO_OBSERVATION
        || verdict === VERDICT.NO_SETTLEMENT
        || verdict === VERDICT.NOT_REQUIRED) return 3;
    return 0;
}

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
        decisionSchemaUID: requiredSchemaUID("POI_DECISION_SCHEMA_UID"),
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
    return exitCodeFor(report.verdict);
}

// 직접 실행할 때만 돈다. import 하면 실행되던 탓에 테스트가 CLI 를 돌려버렸다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().then(
        (code) => process.exit(code),
        (error: unknown) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(2);
        },
    );
}
