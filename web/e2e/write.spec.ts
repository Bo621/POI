import {expect, test, type Locator, type Page} from "@playwright/test";
import {accounts, chainNow, injectWallet, openDetails, requireSeed, rpcUrl} from "./fixtures";

test.beforeAll(() => {
    requireSeed();
});

function section(page: Page, heading: string): Locator {
    return page.getByRole("heading", {name: heading, exact: true}).locator("..");
}

async function connect(page: Page, account = accounts.A, hash = "#/record"): Promise<void> {
    await injectWallet(page, account, rpcUrl);
    await page.goto(`/${hash}`);
    await page.getByRole("button", {name: "지갑 연결"}).click();
    await expect(section(page, "지갑").getByText(
        new RegExp(`${account.slice(0, 6)}…${account.slice(-4)}`, "i"),
    )).toBeVisible();
}

async function fillValidOutcome(page: Page): Promise<void> {
    const decision = section(page, "결정 커밋");
    const chainTimestamp = await chainNow();
    await decision.getByLabel("결정 내용").fill(`E2E 결정 ${chainTimestamp}`);
    await decision.getByLabel("trigger").fill("E2E trigger");
    await openDetails(decision, "예상 결과 선언 (선택)");
    await decision.getByLabel("예상 결과 선언").check();
    await decision.getByLabel("metricId").fill(
        "0x83b04966e07f0f83592e71060b3356d716b4dff9f824bd76d0f9d149c54cafcf",
    );
    await decision.getByLabel("windowStart (Unix 초)").fill(String(chainTimestamp + 1800));
    await decision.getByLabel("windowEnd (Unix 초)").fill(String(chainTimestamp + 5400));
    await decision.getByLabel("graceSeconds").fill("3600");
}

test.beforeEach(async ({page}) => {
    await connect(page);
});

test("지갑 연결 주소가 축약 표기된다", async ({page}) => {
    await expect(section(page, "지갑").getByText(
        new RegExp(`${accounts.A.slice(0, 6)}…${accounts.A.slice(-4)}`, "i"),
    )).toBeVisible();
});

test("저널 저장은 로컬 목록에 나타난다", async ({page}) => {
    const journal = section(page, "저널과 노트");
    const text = `E2E 저널 ${await chainNow()}`;
    await journal.getByLabel("저널 내용").fill(text);
    await journal.getByRole("button", {name: "저널 저장"}).click();
    await expect(journal.getByText(text, {exact: true})).toBeVisible();
});

test("결정 커밋은 백업 확인 뒤 발행되고 상태 조회가 된다", async ({page}) => {
    test.setTimeout(30_000);
    await fillValidOutcome(page);
    const decision = section(page, "결정 커밋");
    await decision.getByRole("button", {name: "salt 생성 및 백업"}).click();
    const dialog = page.getByRole("dialog", {name: "salt 백업"});
    const publish = dialog.getByRole("button", {name: "발행", exact: true});
    await expect(publish).toBeDisabled();
    await dialog.getByLabel("저장했습니다").check();
    await expect(publish).toBeEnabled();
    await publish.click();

    const alert = decision.getByRole("alert");
    if (await alert.count()) {
        expect.soft(await alert.textContent(), "결정 발행 alert").toBe("");
    }
    await expect(decision.getByText("트랜잭션", {exact: true})).toBeVisible();
    const uid = await decision.locator("dt", {hasText: "UID"}).locator("+ dd").textContent();
    expect(uid).toMatch(/^0x[0-9a-f]{64}$/i);
    await expect(page).toHaveURL(new RegExp(`#\\/d\\/${uid}$`, "i"));
    await expect(page.getByRole("img", {name: /상태: (대기|관측 중)/})).toBeVisible();

    await page.goto("/#/me");
    await page.getByRole("button", {name: "지갑 연결"}).click();
    await expect(section(page, "전체").getByText(uid!, {exact: true})).toBeVisible();
});

test("과거 windowStart는 한국어 오류로 발행을 막는다", async ({page}) => {
    await fillValidOutcome(page);
    const decision = section(page, "결정 커밋");
    await decision.getByLabel("windowStart (Unix 초)").fill(
        String(await chainNow() - 60),
    );
    await decision.getByRole("button", {name: "salt 생성 및 백업"}).click();
    await expect(decision.getByRole("alert")).toHaveText("관측 구간 시작은 발행 시점 이후여야 합니다.");
    await expect(page.getByRole("dialog", {name: "salt 백업"})).toHaveCount(0);
});

test("30분 graceSeconds는 한국어 오류로 발행을 막는다", async ({page}) => {
    await fillValidOutcome(page);
    const decision = section(page, "결정 커밋");
    await decision.getByLabel("graceSeconds").fill("1800");
    await decision.getByRole("button", {name: "salt 생성 및 백업"}).click();
    await expect(decision.getByRole("alert")).toHaveText("유예 기간은 1시간 이상 30일 이하여야 합니다.");
    await expect(page.getByRole("dialog", {name: "salt 백업"})).toHaveCount(0);
});

test("B 계정의 F1 정산 시도는 한국어 소유자 오류를 표시한다", async ({page}) => {
    await connect(page, accounts.B, `#/d/${requireSeed().fixtures.f1.decisionUID}`);
    const settlement = section(page, "정산");
    await settlement.getByLabel("decisionUID", {exact: true}).fill(requireSeed().fixtures.f1.decisionUID);
    await settlement.getByRole("button", {name: "정산 확인"}).click();
    await expect(settlement.getByRole("alert")).toHaveText("결정 작성자만 정산할 수 있습니다.");
    await expect(settlement.getByRole("button", {name: "정산 발행"})).toBeDisabled();
});

test("지갑 없이 기록하기에 진입하면 발행 폼이 비활성이고 이유가 보인다", async ({page}) => {
    await page.goto("/#/record");
    await expect(page.getByRole("button", {name: "salt 생성 및 백업"})).toBeDisabled();
    await expect(page.getByText("지갑을 연결해야 결정 기록을 발행할 수 있습니다.")).toBeVisible();
});
