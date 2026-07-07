import { expect, test } from "@playwright/test";

test.describe("context ingestion", () => {
  test("extracts pasted profile facts, saves after preview, and reflects them in Kai's next question", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const feature = "eikaiwa-buddy";
    await page.goto("/");

    await page.getByRole("button", { name: "Kaiに自分のことを教える" }).click();
    await expect(page.getByRole("dialog", { name: "Kaiに自分のことを教える" })).toBeVisible();
    await page.getByLabel("プロフィールやSNS投稿").fill("職業は宇宙カレー研究者です。趣味は深夜ラジオです。海外の人に研究の話を自然に説明したいです。");
    await page.getByRole("button", { name: "factを抽出" }).click();

    await expect(page.getByLabel("preview key 1")).toBeVisible({ timeout: 90_000 });
    await expect(page.locator(".context-modal .model-tag", { hasText: "gemini-3.1-flash-lite" })).toBeVisible();
    await expect(page.getByText("API利用料金")).toBeVisible();
    await expect(page.locator(".fact-editor input").nth(1)).not.toHaveValue("");
    await page.screenshot({ path: `.artifacts/${feature}/images/${testInfo.project.name}-v21b-context-preview.png`, fullPage: false });

    await page.getByRole("button", { name: "プレビューを保存" }).click();
    await expect(page.locator(".fact-list")).toContainText(/宇宙カレー|深夜ラジオ/, { timeout: 20_000 });
    await page.getByRole("button", { name: "閉じる" }).click();
    await page.getByText("モデル別内訳").click();
    await expect(page.getByText("context_ingest")).toBeVisible({ timeout: 20_000 });

    await page.getByPlaceholder("日本語で話したいことを入力... Shift+Enterで改行").fill("自己紹介を作りたいです");
    await page.getByRole("button", { name: "送信" }).click();
    await expect(page.getByText(/登録済み/)).toBeVisible({ timeout: 120_000 });
    await expect(page.locator(".bubble.coach").last()).toContainText("gemini-3.5-flash");
    await expect(page.getByText("chat /")).toBeVisible();
    await page.screenshot({ path: `.artifacts/${feature}/images/${testInfo.project.name}-v21b-context-reflected.png`, fullPage: false });
  });
});
