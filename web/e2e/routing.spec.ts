import {expect, test, type Page} from "@playwright/test";
import {requireSeed} from "./fixtures";

async function expectAppAt(page: Page, hash: string, timeout?: number): Promise<void> {
    await expect(page.locator("#root")).not.toBeEmpty({timeout});
    await expect.poll(() => page.evaluate(() => window.location.hash), {timeout}).toBe(hash);
}

test("홈으로 직접 진입한다", async ({page}) => {
    await page.goto("/#/");

    await expectAppAt(page, "#/");
});

test("결정 딥링크로 직접 진입하면 500ms 안에 앱이 뜬다", async ({page}) => {
    const hash = `#/d/${requireSeed().fixtures.f1.decisionUID}`;

    await page.goto(`/${hash}`);

    await expectAppAt(page, hash, 500);
});

test("새로고침해도 URL이 유지된다", async ({page}) => {
    const hash = `#/d/${requireSeed().fixtures.f1.decisionUID}`;
    await page.goto(`/${hash}`);

    await page.reload();

    await expectAppAt(page, hash);
});

test("이동 후 뒤로 가면 이전 URL로 돌아간다", async ({page}) => {
    await page.goto("/#/");
    await page.evaluate(() => {
        window.location.hash = "#/record";
    });
    await expectAppAt(page, "#/record");

    await page.goBack();

    await expectAppAt(page, "#/");
});

test("뒤로 간 뒤 앞으로 가면 이동한 URL로 돌아간다", async ({page}) => {
    await page.goto("/#/");
    await page.evaluate(() => {
        window.location.hash = "#/record";
    });
    await expectAppAt(page, "#/record");
    await page.goBack();
    await expectAppAt(page, "#/");

    await page.goForward();

    await expectAppAt(page, "#/record");
});

test("없는 경로에서도 앱과 URL이 유지된다", async ({page}) => {
    await page.goto("/#/없는경로");

    await expectAppAt(page, "#/%EC%97%86%EB%8A%94%EA%B2%BD%EB%A1%9C");
    await expect.poll(() => page.evaluate(() => decodeURIComponent(window.location.hash)))
        .toBe("#/없는경로");
});

test("짧은 UID 경로에서도 앱과 URL이 유지된다", async ({page}) => {
    await page.goto("/#/d/0x123");

    await expectAppAt(page, "#/d/0x123");
});
