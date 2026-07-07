import { chromium, expect, test } from "@playwright/test";

test("good and accented fixtures produce visible score evidence through real Gemini API", async () => {
  const good = await runAttemptWithFixture("fixtures/hello-good.wav", "good");
  const accented = await runAttemptWithFixture("fixtures/hello-accented.wav", "accented");
  expect(good.score).not.toBe(accented.score);
});

async function runAttemptWithFixture(fixture: string, label: string): Promise<{ score: number }> {
  const browser = await chromium.launch({
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
  await page.locator(".chat-input button").click();
  await expect(page.locator(".english")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Hello, nice to meet you")).toBeVisible();
  await page.getByRole("button", { name: /タップして話す|録音中/ }).click();
  await page.waitForTimeout(2800);
  await page.getByRole("button", { name: /録音中/ }).click();
  await expect(page.getByText(/もう一度練習|ゆっくり練習|次の文章へ|レベルアップ候補/)).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `.artifacts/eikaiwa-buddy/images/audio-${label}-feedback.png`, fullPage: true });
  const text = (await page.locator(".score-gauge strong").textContent()) ?? "0";
  await browser.close();
  return { score: Number.parseInt(text, 10) };
}
