import { expect, test } from "@playwright/test";

test.describe("eikaiwa-buddy real Gemini flow", () => {
  test("starts a session, proposes a phrase, records fake mic audio, shows word feedback, and restores after reload", async ({ page }, testInfo) => {
    const feature = "eikaiwa-buddy";
    await page.goto("/");
    await expect(page.getByText("コーチとの会話")).toBeVisible();
    await page.screenshot({ path: `.artifacts/${feature}/images/${testInfo.project.name}-01-start.png`, fullPage: false });

    await page.getByPlaceholder("日本語で話したいことを入力...").fill("自己紹介で、英文は必ず Hello, nice to meet you を練習したいです。");
    await page.getByPlaceholder("日本語で話したいことを入力...").press("Enter");
    await expect(page.getByText("今日のフレーズ")).toBeVisible();
    await expect(page.locator(".english")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".english")).toContainText(/Hello, nice to meet you\.?/);
    await page.screenshot({ path: `.artifacts/${feature}/images/${testInfo.project.name}-02-phrase.png`, fullPage: false });

    await page.getByRole("button", { name: "録音を開始" }).click();
    await expect(page.getByText(/録音中/)).toBeVisible();
    await page.waitForTimeout(2800);
    await page.getByRole("button", { name: "録音を停止" }).click();
    await expect(page.locator(".score-gauge strong")).toHaveText(/\d+/, { timeout: 120_000 });
    await expect(page.locator(".word small").first()).not.toHaveText("未判定", { timeout: 120_000 });
    await expect(page.getByRole("button", { name: "録音を開始" })).toBeVisible();
    await expect(page.locator(".word.ok, .word.unclear, .word.wrong, .word.missing").first()).toBeVisible();
    await page.screenshot({ path: `.artifacts/${feature}/images/${testInfo.project.name}-03-feedback.png`, fullPage: false });

    const scoreText = await page.locator(".score-gauge strong").textContent();
    expect(scoreText).toMatch(/\d+|--/);
    await page.reload();
    await expect(page.locator(".english")).toBeVisible();
    await expect(page.getByText("最近の練習履歴")).toBeVisible();
    await page.screenshot({ path: `.artifacts/${feature}/images/${testInfo.project.name}-04-restored.png`, fullPage: false });
  });
});
