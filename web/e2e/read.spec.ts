import {expect, test, type Locator, type Page} from "@playwright/test";
import {accounts, requireSeed} from "./fixtures";

test.beforeAll(() => {
    requireSeed();
});

async function loadStatus(page: Page, uid: string, label: string): Promise<void> {
    await page.goto(`/#/d/${uid}`);
    await expect(page.getByRole("img", {name: `상태: ${label}`})).toBeVisible();
}

function section(page: Page, heading: string): Locator {
    return page.getByRole("heading", {name: heading, exact: true}).locator("..");
}

test("배포 안내가 없고 F1은 정산완료다", async ({page}) => {
    await loadStatus(page, requireSeed().fixtures.f1.decisionUID, "정산 완료");
    await expect(page.getByText("컨트랙트가 아직 배포되지 않았습니다.")).toHaveCount(0);
    await expect(page.getByText("정산완료", {exact: true})).toBeVisible();
});

test("F4는 기한초과다", async ({page}) => {
    await loadStatus(page, requireSeed().fixtures.f4.decisionUID, "기한 초과");
    await expect(page.getByText("기한초과", {exact: true})).toBeVisible();
});

test("F2는 정산완료이며 철회 이력이 있다", async ({page}) => {
    await loadStatus(page, requireSeed().fixtures.f2.decisionUID, "정산 완료");
    await expect(page.getByText("정산완료", {exact: true})).toBeVisible();
    await expect(page.getByText("정산 철회 이력 있음")).toBeVisible();
});

test("F5는 대기다", async ({page}) => {
    await loadStatus(page, requireSeed().fixtures.f5.decisionUID, "대기");
    const status = page.locator("section.status-result");
    await expect(status.getByRole("img", {name: "상태: 대기"})).toBeVisible();
    await expect(status.locator("dl").getByText("대기", {exact: true})).toBeVisible();
});

test("이의 목록은 한 항목이며 건수 표현과 완전성 보장이 없다", async ({page}) => {
    await page.goto(`/#/d/${requireSeed().fixtures.f1.decisionUID}`);
    const challenge = page.getByRole("heading", {name: "이의", exact: true}).locator("..");
    await expect(challenge.getByText(requireSeed().challengeUID, {exact: true})).toBeVisible();
    await expect(challenge.locator("ul.record-list > li")).toHaveCount(1);
    await expect(challenge).not.toContainText(/\d+\s*건/);
    await expect(challenge.getByText("조회된 것이 전부라는 보장은 없습니다.")).toBeVisible();
});

test.describe("Reveal commitment 대조", () => {
    async function fillReveal(page: Page, uid: string): Promise<Locator> {
        await page.goto(`/#/d/${uid}`);
        const reveal = section(page, "공개");
        const data = requireSeed();
        await expect(reveal.getByLabel("attestationUID")).toHaveValue(uid);
        await reveal.getByLabel("salt", {exact: true}).fill(data.f1Reveal.salt);
        await reveal.getByLabel("payload (JSON)", {exact: true}).fill(JSON.stringify(data.f1Reveal.payload));
        return reveal;
    }

    test("F1은 일치한다", async ({page}) => {
        const reveal = await fillReveal(page, requireSeed().fixtures.f1.decisionUID);
        await expect(reveal.getByText("commitment가 일치합니다.")).toBeVisible();
        await expect(reveal.getByRole("button", {name: "RevealFile 다운로드"})).toBeEnabled();
    });

    test("CT18 사본은 불일치하고 다운로드할 수 없다", async ({page}) => {
        const reveal = await fillReveal(page, requireSeed().fixtures.f_copy.decisionUID);
        await expect(reveal.getByText(/일치하지 않습니다/)).toBeVisible();
        await expect(reveal.locator("#reveal-attester")).toHaveText(
            new RegExp(`^${accounts.B}$`, "i"),
        );
        await expect(reveal.getByRole("button", {name: "RevealFile 다운로드"})).toBeDisabled();
    });
});

test("DAG에 노드와 조회 완전성 안내가 나온다", async ({page}) => {
    await page.goto(`/#/d/${requireSeed().fixtures.f1.decisionUID}`);
    const dag = section(page, "계보");
    await dag.locator("summary").click();
    await expect(dag.getByText("UID", {exact: true})).toBeVisible();
    await expect(dag.getByText("조회된 것이 전부라는 보장은 없습니다.")).toBeVisible();
});

test("Passport에 목록과 비순위 안내가 나온다", async ({page}) => {
    await page.goto(`/#/passport/${accounts.A}`);
    const passport = page.locator("main");
    const uid = requireSeed().fixtures.f1.decisionUID;
    await expect(passport.getByText(
        new RegExp(`^${uid.slice(0, 10)}…${uid.slice(-6)}$`, "i"),
    )).toBeVisible();
    await expect(passport.getByText(/순위나 성과 지표가 아닙니다/)).toBeVisible();
});
