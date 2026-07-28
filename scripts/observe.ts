import {METRICS, scale, type MetricDefinition} from "../core/src/index.ts";
import {defaultProviders} from "../verifier/src/providers.ts";

function fail(message: string): never {
    process.stderr.write(`observe: ${message}\n`);
    process.exit(1);
}

const [metricName, startText, endText] = process.argv.slice(2);
if (!metricName || !startText || !endText) {
    fail("usage: observe.ts <metricName> <windowStart> <windowEnd>");
}

let windowStart: bigint;
let windowEnd: bigint;
try {
    windowStart = BigInt(startText);
    windowEnd = BigInt(endText);
} catch {
    fail("windowStart and windowEnd must be integer Unix timestamps");
}
if (windowEnd <= windowStart) fail("windowEnd must be after windowStart");

const metric = METRICS.find((candidate) => candidate.name === metricName) as MetricDefinition | undefined;
if (!metric) fail(`unknown metric: ${metricName}`);
const provider = defaultProviders().get(metric.metricId);
if (!provider) fail(`no provider registered for: ${metricName}`);

const observation = await provider.observe(windowStart, windowEnd);
if (observation.kind !== "ok") fail(`${observation.kind}: ${observation.reason}`);
process.stdout.write(`${scale(observation.raw, metric.decimals)}\n`);
