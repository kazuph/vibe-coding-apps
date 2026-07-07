import { chromium, expect, test } from "@playwright/test";
import path from "node:path";

test.setTimeout(360_000);

test("good and accented fixtures produce visible score evidence through real Gemini API", async ({ browserName }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || browserName !== "chromium", "audio fixture comparison runs once on desktop Chrome");
  const good = await runAttemptWithFixture(path.resolve("fixtures/hello-good.wav"), "good");
  const accented = await runAttemptWithFixture(path.resolve("fixtures/hello-accented.wav"), "accented");
  expect(good.score).not.toBe(accented.score);
});

async function runAttemptWithFixture(fixture: string, label: string): Promise<{ score: number }> {
  const browser = await chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${fixture}`
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:8802/");
  await expect(page.getByText("コーチとの会話")).toBeVisible();
  await page.getByPlaceholder("日本語で話したいことを入力...").fill("自己紹介で、英文は必ず Hello, nice to meet you を練習したいです。");
  await page.getByPlaceholder("日本語で話したいことを入力...").press("Enter");
  await expect(page.locator(".english")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".english")).toContainText(/Hello, nice to meet you\.?/);
  await page.getByRole("button", { name: "録音を開始" }).click();
  await page.waitForTimeout(2800);
  await page.getByRole("button", { name: "録音を停止" }).click();
  await expect(page.locator(".score-gauge strong")).toHaveText(/\d+/, { timeout: 120_000 });
  await expect(page.locator(".word small").first()).not.toHaveText("未判定", { timeout: 120_000 });
  await expect(page.getByRole("button", { name: "録音を開始" })).toBeVisible();
  await page.screenshot({ path: `.artifacts/eikaiwa-buddy/images/audio-${label}-feedback.png`, fullPage: true });
  const text = (await page.locator(".score-gauge strong").textContent()) ?? "0";
  await browser.close();
  return { score: Number.parseInt(text, 10) };
}
