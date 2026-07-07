import { expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? 18802}`;

export async function runHelloAttempt(page: Page, label: string): Promise<number> {
  await page.goto(baseURL);
  await expect(page.getByText("コーチとの会話")).toBeVisible();
  const cookie = (await page.context().cookies()).find((item) => item.name === "eb_uid");
  if (!cookie) throw new Error("eb_uid cookie was not created.");
  await installHelloPractice(page);
  await page.reload();
  await expect(page.locator(".english")).toContainText(/Hello, nice to meet you\.?/);
  await page.getByRole("button", { name: "録音を開始" }).click();
  await page.waitForTimeout(2800);
  await page.getByRole("button", { name: "録音を停止" }).click();
  const score = await waitForLatestHelloScore(cookie.value);
  await page.reload();
  await expect(page.locator(".score-gauge strong")).toHaveText(String(score), { timeout: 30_000 });
  await expect(page.locator(".word.ok, .word.unclear, .word.wrong, .word.missing").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "録音を開始" })).toBeVisible();
  await page.screenshot({ path: `.artifacts/eikaiwa-buddy/images/audio-${label}-feedback.png`, fullPage: false });
  return score;
}

export function fakeMicArgs(fixture: string): string[] {
  return [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-audio-capture=${fixture}`
  ];
}

async function installHelloPractice(page: Page): Promise<void> {
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

function querySql<T>(command: string): T[] {
  const output = execFileSync("npx", ["wrangler", "d1", "execute", "eikaiwa_buddy", "--local", "--command", command], {
    cwd: process.cwd(),
    env: { ...process.env, HOME: "/tmp/eikaiwa-wrangler-home", XDG_CONFIG_HOME: "/tmp/eikaiwa-xdg" },
    encoding: "utf8",
    stdio: "pipe"
  });
  const match = output.match(/\[\s*\{\s*"results"[\s\S]*\}\s*\]\s*$/);
  if (!match) return [];
  const parsed = JSON.parse(match[0]) as Array<{ results: T[] }>;
  return parsed[0]?.results ?? [];
}

async function waitForLatestHelloScore(userId: string): Promise<number> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const rows = querySql<{ score: number }>(`SELECT a.pronunciation_score AS score
      FROM attempts a JOIN sessions s ON s.id = a.session_id
      WHERE s.user_id = ${sql(userId)} AND a.phrase_en LIKE 'Hello, nice to meet you%'
      ORDER BY a.created_at DESC LIMIT 1`);
    const score = rows[0]?.score;
    if (typeof score === "number") return score;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Timed out waiting for the real Gemini pronunciation attempt.");
}

function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
