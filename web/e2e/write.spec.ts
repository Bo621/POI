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
    await page.getByRole("button", {name: "연결", exact: true}).click();
    await expect(page.getByRole("navigation").getByText(
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

test.beforeEach(async ({page}, testInfo) => {
    if (testInfo.title.startsWith("지갑 없이")) {
        await injectWallet(page, accounts.A, rpcUrl, {authorized: false});
        await page.goto("/#/record");
    } else {
        await connect(page);
    }
});

test("지갑 연결 주소가 축약 표기된다", async ({page}) => {
    await expect(page.getByRole("navigation").getByText(
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
    await page.getByRole("button", {name: "연결", exact: true}).click();
    await expect(section(page, "전체").getByText(
        new RegExp(`^${uid!.slice(0, 10)}…${uid!.slice(-6)}$`, "i"),
    )).toBeVisible();
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

test("B 계정의 F1 정산 시도는 한국어 소유자 오류를 표시한다", async ({page, context}) => {
    await page.close();
    const pageB = await context.newPage();
    await connect(pageB, accounts.B, `#/d/${requireSeed().fixtures.f1.decisionUID}`);
    const settlement = section(pageB, "정산");
    await expect(settlement.getByText("결정 작성자만 정산할 수 있습니다.", {exact: true})).toBeVisible();
    await expect(settlement.getByRole("button", {name: "정산 확인"})).toHaveCount(0);
});

test("지갑 없이 기록하기에 진입해 작성과 salt 백업을 하고 발행만 비활성이다", async ({page}) => {
    await page.goto("/#/record");
    const journal = section(page, "저널과 노트");
    await journal.getByLabel("저널 내용").fill("지갑 없는 노트");
    await journal.getByRole("button", {name: "저널 저장"}).click();
    await journal.getByRole("button", {name: "노트로 승격"}).click();
    const noteDialog = page.getByRole("dialog", {name: "salt 백업"});
    await noteDialog.getByLabel("저장했습니다").check();
    await expect(noteDialog.getByRole("button", {name: "발행", exact: true})).toBeDisabled();
    await expect(noteDialog.getByText("노트를 발행하려면 지갑을 연결해 주세요.")).toBeVisible();
    await noteDialog.getByRole("button", {name: "취소"}).click();

    const decision = section(page, "결정 커밋");
    await decision.getByLabel("결정 내용").fill("지갑 없는 결정");
    await decision.getByLabel("trigger").fill("지갑 없는 trigger");
    await expect(decision.getByRole("button", {name: "salt 생성 및 백업"})).toBeEnabled();
    await decision.getByRole("button", {name: "salt 생성 및 백업"}).click();
    const dialog = page.getByRole("dialog", {name: "salt 백업"});
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("저장했습니다").check();
    await expect(dialog.getByRole("button", {name: "발행", exact: true})).toBeDisabled();
    await expect(dialog.getByText("결정 기록을 발행하려면 지갑을 연결해 주세요.")).toBeVisible();
    await expect(page.getByRole("list", {name: "기록 단계"})
        .getByText("③ 결정", {exact: true}).locator("..")).toHaveAttribute("aria-current", "step");
    await dialog.getByRole("button", {name: "취소"}).click();
});
