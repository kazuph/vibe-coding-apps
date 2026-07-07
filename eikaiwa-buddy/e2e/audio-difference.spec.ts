import { chromium, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? 18802}`;

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
  await page.goto(baseURL);
  await expect(page.getByText("コーチとの会話")).toBeVisible();
  await installHelloPractice(page);
  await page.reload();
  await expect(page.locator(".english")).toContainText(/Hello, nice to meet you\.?/);
  await page.getByRole("button", { name: "録音を開始" }).click();
  await page.waitForTimeout(2800);
  await page.getByRole("button", { name: "録音を停止" }).click();
  await expect(page.locator(".score-gauge strong")).toHaveText(/\d+/, { timeout: 120_000 });
  await expect(page.locator(".word small").first()).not.toHaveText("未判定", { timeout: 120_000 });
  await expect(page.getByRole("button", { name: "録音を開始" })).toBeVisible();
  await page.screenshot({ path: `.artifacts/eikaiwa-buddy/images/audio-${label}-feedback.png`, fullPage: false });
  const text = (await page.locator(".score-gauge strong").textContent()) ?? "0";
  await browser.close();
  return { score: Number.parseInt(text, 10) };
}

async function installHelloPractice(page: import("@playwright/test").Page): Promise<void> {
  const cookie = (await page.context().cookies()).find((item) => item.name === "eb_uid");
  if (!cookie) throw new Error("eb_uid cookie was not created.");
  const scriptId = crypto.randomUUID();
  const phrase = {
    en: "Hello, nice to meet you",
    ja: "こんにちは、はじめまして。",
    why_ja: "初対面で自然に使える定番のあいさつです。",
    pronunciation_tips_ja: ["Hello: hの息を軽く出す", "nice: 最後のsを短く出す", "meet: 長いiを保つ"]
  };
  const variants = [{ style: "natural", en: phrase.en, why_ja: phrase.why_ja, traps: [
    { word: "Hello", tip_ja: "hの息を軽く出す" },
    { word: "nice", tip_ja: "最後のsを短く出す" },
    { word: "meet", tip_ja: "長いiを保つ" }
  ] }];
  execSql(`INSERT INTO scripts (id, user_id, topic, status, interview_json, created_at, updated_at)
    VALUES (${sql(scriptId)}, ${sql(cookie.value)}, '自己紹介', 'practicing', ${sql(JSON.stringify({
      version: 2,
      turn_count: 3,
      max_turns: 3,
      last_question_ja: null,
      chips: [],
      draft_sentences_ja: [phrase.ja],
      approved_at: new Date().toISOString()
    }))}, datetime('now'), datetime('now'))`);
  execSql(`INSERT INTO script_sentences (script_id, position, ja_text, en_variants_json, en_selected, best_score, practice_count)
    VALUES (${sql(scriptId)}, 1, ${sql(phrase.ja)}, ${sql(JSON.stringify(variants))}, ${sql(phrase.en)}, 0, 0)`);
  execSql(`UPDATE sessions SET topic = '自己紹介', state = 'practice', phase = 'practice',
    script_id = ${sql(scriptId)}, active_sentence_position = 1, current_phrase_json = ${sql(JSON.stringify(phrase))}, updated_at = datetime('now')
    WHERE user_id = ${sql(cookie.value)}`);
}

function execSql(command: string): void {
  execFileSync("npx", ["wrangler", "d1", "execute", "eikaiwa_buddy", "--local", "--command", command], {
    cwd: process.cwd(),
    env: { ...process.env, HOME: "/tmp/eikaiwa-wrangler-home", XDG_CONFIG_HOME: "/tmp/eikaiwa-xdg" },
    stdio: "pipe"
  });
}

function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
