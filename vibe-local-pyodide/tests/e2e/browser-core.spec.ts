import { expect, test } from "@playwright/test";

const apiBaseUrl =
  process.env.VIBE_LOCAL_TEST_API_BASE_URL ??
  "http://ubuntu-3090.tail5f04b.ts.net:8031/v1";

test.describe("vibe-local browser core", () => {
  test("settings, persistence, and one chat turn work", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "vibe-local Pyodide" })).toBeVisible();
    await expect(page.getByText("Backend settings")).toBeVisible();

    await page.getByLabel("Base URL").fill(apiBaseUrl);
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Backend settings を保存しました。")).toBeVisible();

    await page.getByRole("button", { name: "Refresh models" }).click();
    await expect(page.getByText(/モデルを \d+ 件取得しました。/)).toBeVisible({
      timeout: 30_000,
    });

    const modelInput = page.getByLabel("Model");
    await expect(modelInput).not.toHaveValue("", {
      timeout: 30_000,
    });

    await page.getByPlaceholder("例: vibe-local の transcript compaction をどう改善する？").fill(
      "こんにちは。vibe-local browser core の動作確認です。短く返事して。",
    );

    await page.getByRole("button", { name: "Send" }).click();

    await expect(
      page.locator(".message-bubble.role-user").getByText(
        "こんにちは。vibe-local browser core の動作確認です。短く返事して。",
      ),
    ).toBeVisible();

    await expect(page.locator(".message-bubble.role-assistant")).toHaveCount(1, {
      timeout: 60_000,
    });
    await expect(page.locator(".message-bubble.role-assistant").first()).not.toContainText(/^$/);
    await expect(page.locator(".message-bubble.role-assistant").first()).toBeInViewport();
    await expect(page.getByText("応答を保存しました。")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel("Base URL")).toHaveValue(apiBaseUrl);
    await expect(page.locator(".session-card")).toHaveCount(1);
    await expect(page.locator(".message-bubble.role-assistant")).toHaveCount(1);
  });
});
