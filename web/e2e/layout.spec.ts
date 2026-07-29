import {expect, test, type Page} from "@playwright/test";
import {accounts, injectWallet, requireSeed, rpcUrl, shortAddressRe} from "./fixtures";

test.beforeAll(() => {
    requireSeed();
});

/**
 * **존재가 아니라 겹침을 본다.**
 *
 * E2E 27개가 전부 통과하는 동안 지갑 연결 상태의 모든 화면에서 `<h1>` 이 고정 nav
 * 뒤에 가려져 있었다. `getByRole('heading')` 는 요소가 있는지만 보고 보이는지는 보지 않는다.
 *
 * nav 는 내용에 따라 높이가 변하는데(지갑 배지가 붙으면 커진다) `--nav-height` 가
 * 상수였던 것이 원인이다. 지금은 ResizeObserver 로 실측하지만, 그게 깨지면
 * 이 테스트가 먼저 잡는다.
 */
async function expectHeadingNotCovered(page: Page, path: string) {
    await page.goto(`/${path}`);
    const h1 = page.locator("main h1").first();
    await expect(h1).toBeVisible();
    const navBox = await page.locator(".site-nav").boundingBox();
    const h1Box = await h1.boundingBox();
    expect(navBox, "nav 경계 상자").not.toBeNull();
    expect(h1Box, "h1 경계 상자").not.toBeNull();
    expect(
        h1Box!.y,
        `${path} 의 제목이 nav(높이 ${navBox!.height}px) 뒤에 가려진다`,
    ).toBeGreaterThanOrEqual(navBox!.y + navBox!.height);
}

const PATHS = ["#/", "#/record", "#/me", "#/verify"];

test("지갑 미연결 상태에서 제목이 nav 에 가리지 않는다", async ({page}) => {
    for (const path of PATHS) await expectHeadingNotCovered(page, path);
});

test("지갑 연결 상태에서 제목이 nav 에 가리지 않는다", async ({page}) => {
    await injectWallet(page, accounts.A, rpcUrl);
    await page.goto("/#/record");
    await page.getByRole("button", {name: "연결", exact: true}).click();
    await expect(page.getByRole("navigation").getByText(shortAddressRe(accounts.A))).toBeVisible();

    for (const path of PATHS) await expectHeadingNotCovered(page, path);
    await expectHeadingNotCovered(page, `#/d/${requireSeed().fixtures.f1.decisionUID}`);
});

test("좁은 화면에서 nav 가 줄바꿈돼도 제목을 가리지 않는다", async ({page}) => {
    // 데스크톱 폭에서는 nav 가 한 줄이라 --nav-height 상수와 우연히 맞는다.
    // 이 결함은 nav 가 **줄바꿈될 때** 드러난다 — 좁은 화면이나 지갑 배지가 붙었을 때다.
    await page.setViewportSize({width: 380, height: 760});
    await injectWallet(page, accounts.A, rpcUrl);
    await page.goto("/#/record");
    await page.getByRole("button", {name: "연결", exact: true}).click();
    await expect(page.getByRole("navigation").getByText(shortAddressRe(accounts.A))).toBeVisible();

    const navBox = await page.locator(".site-nav").boundingBox();
    expect(navBox!.height, "좁은 화면에서 nav 는 줄바꿈돼 한 줄보다 높아야 한다").toBeGreaterThan(80);
    for (const path of PATHS) await expectHeadingNotCovered(page, path);
});

test("발행 경고는 nav 가 아니라 기록하기에 있다", async ({page}) => {
    const warning = /검증 지갑 스냅샷 UID를 찾지 못했습니다/;
    await injectWallet(page, accounts.A, rpcUrl);
    await page.goto("/#/record");
    await page.getByRole("button", {name: "연결", exact: true}).click();
    await expect(page.getByRole("navigation").getByText(shortAddressRe(accounts.A))).toBeVisible();

    // 발행 시점 경고다 — 탐색 영역에 있으면 조회만 하는 화면에서도 계속 보인다.
    await expect(page.getByRole("navigation").getByText(warning)).toHaveCount(0);
    await expect(page.locator("main").getByText(warning)).toBeVisible();

    await page.goto("/#/verify");
    await expect(page.getByText(warning)).toHaveCount(0);
});

test("새로고침해도 연결이 유지된다", async ({page}) => {
    // eth_accounts 는 프롬프트 없이 이미 승인된 계정을 돌려준다.
    // 이걸 쓰지 않아서 새로고침할 때마다 '지갑 연결 안 됨' 으로 돌아갔다.
    await injectWallet(page, accounts.A, rpcUrl);
    await page.goto("/#/me");
    await page.getByRole("button", {name: "연결", exact: true}).click();
    await expect(page.getByRole("navigation").getByText(shortAddressRe(accounts.A))).toBeVisible();

    await page.reload();
    await expect(page.getByRole("navigation").getByText(shortAddressRe(accounts.A))).toBeVisible();
    await expect(page.getByRole("button", {name: "연결", exact: true})).toHaveCount(0);
});

test("연결을 해제하면 상태가 지워진다", async ({page}) => {
    await injectWallet(page, accounts.A, rpcUrl);
    await page.goto("/#/me");
    await page.getByRole("button", {name: "연결", exact: true}).click();
    await expect(page.getByRole("navigation").getByText(shortAddressRe(accounts.A))).toBeVisible();

    await page.getByRole("button", {name: "연결 해제", exact: true}).click();
    await expect(page.getByRole("navigation").getByText("지갑 연결 안 됨")).toBeVisible();
    await expect(page.locator("main").getByText("지갑을 연결하면 내 기록을 불러옵니다.")).toBeVisible();
});
