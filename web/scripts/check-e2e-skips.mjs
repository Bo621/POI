import {readFile} from "node:fs/promises";

const reportPath = new URL("../test-results/e2e-results.json", import.meta.url);
const report = JSON.parse(await readFile(reportPath, "utf8"));

const skipped = [];

function inspect(value) {
    if (!value || typeof value !== "object") return;

    if (value.status === "skipped" || value.expectedStatus === "skipped") {
        skipped.push(value.title ?? value.titlePath?.join(" > ") ?? "unknown test");
    }

    for (const child of Object.values(value)) {
        if (Array.isArray(child)) child.forEach(inspect);
        else inspect(child);
    }
}

inspect(report);

if (skipped.length > 0) {
    console.error(`E2E skipped tests: ${skipped.length}`);
    process.exit(1);
}

console.log("E2E skipped tests: 0");
