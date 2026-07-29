import {expect, test, type BrowserContext, type Locator, type Page} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {
    ensureConnected,
    accounts,
    advanceChain,
    chainNow,
    injectWallet,
    openDetails,
    requireSeed,
    rpcUrl,
    shortAddressRe,
} from "./fixtures";

test.beforeAll(() => {
    requireSeed();
});

const METRIC_ID = "0x83b04966e07f0f83592e71060b3356d716b4dff9f824bd76d0f9d149c54cafcf";

function section(page: Page, heading: string): Locator {
    return page.getByRole("heading", {name: heading, exact: true}).locator("..");
}

async function connect(context: BrowserContext, account: typeof accounts.A): Promise<Page> {
    const page = await context.newPage();
    await injectWallet(page, account, rpcUrl);
    await page.goto("/");
    await ensureConnected(page);
    await expect(page.getByRole("navigation").getByText(shortAddressRe(account))).toBeVisible();
    return page;
}

async function receiptUID(area: Locator): Promise<string> {
    await expect(area.getByText("트랜잭션", {exact: true})).toBeVisible();
    const uid = await area.locator("dt", {hasText: "UID"}).locator("+ dd").textContent();
    expect(uid).toMatch(/^0x[0-9a-f]{64}$/i);
    return uid!;
}

async function expectNoAlert(area: Locator, label: string): Promise<void> {
    const alert = area.getByRole("alert");
    if (await alert.count()) {
        expect.soft(await alert.textContent(), label).toBe("");
    }
}

test("저널부터 reveal 다운로드까지 전체 성공 경로를 완주한다", async ({context}) => {
    test.setTimeout(90_000);

    const pageA = await connect(context, accounts.A);
    await pageA.goto("/#/record");
    const journal = section(pageA, "저널과 노트");
    const timestamp = await chainNow();
    const journalText = `FULL-PATH 저널 ${timestamp}`;
    await journal.getByLabel("저널 내용").fill(journalText);
    await journal.getByRole("button", {name: "저널 저장"}).click();
    const journalItem = journal.locator("li", {hasText: journalText});
    await expect(journalItem).toBeVisible();

    await journalItem.getByRole("button", {name: "노트로 승격"}).click();
    const noteDialog = pageA.getByRole("dialog", {name: "salt 백업"});
    await noteDialog.getByLabel("저장했습니다").check();
    await noteDialog.getByRole("button", {name: "발행", exact: true}).click();
    await expectNoAlert(journal, "노트 발행 alert");
    const noteUID = await receiptUID(journal);
    await advanceChain(rpcUrl, 1);

    const decisionText = `FULL-PATH 결정 ${timestamp}`;
    const decision = section(pageA, "결정 커밋");
    const decisionTime = await chainNow();
    const windowEnd = decisionTime + 720;
    await decision.getByLabel("결정 내용").fill(decisionText);
    await decision.getByLabel("trigger").fill("FULL-PATH trigger");
    await openDetails(decision, "예상 결과 선언 (선택)");
    await decision.getByLabel("예상 결과 선언").check();
    await decision.getByLabel("metricId").fill(METRIC_ID);
    await decision.getByLabel("op").fill("0");
    await decision.getByLabel("threshold").fill("90000000");
    await decision.getByLabel("windowStart (Unix 초)").fill(String(decisionTime + 600));
    await decision.getByLabel("windowEnd (Unix 초)").fill(String(windowEnd));
    await decision.getByLabel("graceSeconds").fill("3600");
    await openDetails(decision, "계보 (선택)");
    await decision.getByLabel("승격 노트 UID (선택)").fill(noteUID);
    await decision.getByRole("button", {name: "salt 생성 및 백업"}).click();

    const decisionDialog = pageA.getByRole("dialog", {name: "salt 백업"});
    const publishDecision = decisionDialog.getByRole("button", {name: "발행", exact: true});
    await expect(publishDecision).toBeDisabled();
    const backup = JSON.parse(await decisionDialog.locator("pre").textContent() ?? "") as {
        salts: {decision: string};
    };
    const decisionSalt = backup.salts.decision;
    await decisionDialog.getByLabel("저장했습니다").check();
    await expect(publishDecision).toBeEnabled();
    await expectNoAlert(decision, "결정 발행 alert");
    await publishDecision.click();
    await expect(pageA).toHaveURL(/#\/d\/0x[0-9a-f]{64}$/i);
    const decisionUID = (new URL(pageA.url()).hash.match(/0x[0-9a-f]{64}/i) ?? [])[0];
    expect(decisionUID).toBeTruthy();

    const status = pageA.locator("section.status-result");
    await expect(status.getByRole("img", {name: "상태: 대기"})).toBeVisible();

    const currentTime = await chainNow();
    await advanceChain(rpcUrl, Math.max(1, windowEnd - currentTime + 1));
    await pageA.reload();
    await ensureConnected(pageA);
    await expect(pageA.getByRole("navigation").getByText(shortAddressRe(accounts.A))).toBeVisible();
    const awaiting = pageA.locator("section.status-result");
    await expect(awaiting.getByRole("img", {name: "상태: 등록대기"})).toBeVisible({timeout: 20_000});

    const settlement = section(pageA, "결과 등록");
    await settlement.getByLabel("관측값", {exact: true}).fill("92000000");
    await settlement.getByLabel("출처").fill("FULL-PATH E2E");
    await settlement.getByLabel("verifierVersion").fill("full-path-e2e");
    await settlement.getByRole("button", {name: "결과 등록하기"}).click();
    await expect(settlement.getByText("OBSERVED", {exact: true})).toBeVisible();
    await settlement.getByRole("button", {name: "등록 발행"}).click();
    await expectNoAlert(settlement, "결과 등록 발행 alert");
    const settlementUID = await receiptUID(settlement);

    await expect(awaiting.getByRole("img", {name: "상태: 등록완료"})).toBeVisible();

    await pageA.close();
    const pageB = await connect(context, accounts.B);
    await pageB.goto(`/#/d/${decisionUID}`);
    const challenge = pageB.getByRole("heading", {name: "이의", exact: true, level: 3}).locator("..");
    await expect(challenge.getByLabel("settlementUID", {exact: true})).toHaveCount(0);
    await challenge.getByLabel("출처").fill("FULL-PATH challenge");
    await challenge.getByRole("button", {name: "이의 발행"}).click();
    const challengeUID = await receiptUID(challenge);
    const challengeItem = challenge.locator("ul.record-list > li");
    await expect(challengeItem).toHaveCount(1);
    await expect(challengeItem).toContainText(shortAddressRe(accounts.B));
    await expect(challengeItem).toContainText("OBSERVED");
    await expect(challenge).not.toContainText(/\d+\s*건/);

    await pageB.close();
    const revealPage = await connect(context, accounts.A);
    await revealPage.goto(`/#/d/${decisionUID}`);
    const reveal = section(revealPage, "공개");
    await expect(reveal.getByLabel("attestationUID")).toHaveValue(decisionUID);
    await reveal.getByLabel("salt", {exact: true}).fill(decisionSalt);
    await reveal.getByLabel("payload (JSON)", {exact: true}).fill(JSON.stringify(decisionText));
    await expect(reveal.getByText("commitment가 일치합니다.")).toBeVisible();
    const downloadButton = reveal.getByRole("button", {name: "RevealFile 다운로드"});
    await expect(downloadButton).toBeEnabled();
    const downloadPromise = revealPage.waitForEvent("download");
    await downloadButton.click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const file = JSON.parse(await readFile(downloadPath!, "utf8")) as {
        version: string;
        attestationUID: string;
    };
    expect(file.version).toBe("poi.reveal.v1");
    expect(file.attestationUID).toBe(decisionUID);
});
