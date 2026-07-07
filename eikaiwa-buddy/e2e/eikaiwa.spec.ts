import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test.describe("eikaiwa-buddy v2 real Gemini flow", () => {
  test("interviews in Japanese, restores draft and variants, then connects a selected variant to practice", async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    const feature = "eikaiwa-buddy";
    await page.goto("/");
    await expect(page.getByText("コーチとの会話")).toBeVisible();
    await expect(page.locator(".english")).toHaveCount(0);
    await seedUserContext(page, "job", "エンジニア");

    await page.getByRole("button", { name: "自己紹介" }).click();
    await expect(page.locator(".chip-row button").first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/登録済み/)).toBeVisible();
    await expect(page.locator(".english")).toHaveCount(0);
    await page.screenshot({ path: `.artifacts/${feature}/images/${testInfo.project.name}-v2-01-interview.png`, fullPage: false });

    for (let index = 0; index < 3; index += 1) {
      if (await page.getByLabel("日本語ドラフト").isVisible().catch(() => false)) break;
      const coachCount = await page.locator(".bubble.coach").count();
      const chip = page.locator(".chip-row button").first();
      if (await chip.isVisible().catch(() => false)) {
        await chip.click();
      } else {
        await page.getByPlaceholder("日本語で話したいことを入力...").fill("AIを使った開発ツールを作っています。");
        await page.getByPlaceholder("日本語で話したいことを入力...").press("Enter");
      }
      await expect.poll(async () => {
        const hasDraft = await page.getByLabel("日本語ドラフト").isVisible().catch(() => false);
        const nextCoachCount = await page.locator(".bubble.coach").count();
        return hasDraft || nextCoachCount > coachCount;
      }, { timeout: 120_000 }).toBe(true);
    }

    await expect(page.getByLabel("日本語ドラフト")).toBeVisible({ timeout: 120_000 });
    await expect(page.locator(".english")).toHaveCount(0);
    await page.screenshot({ path: `.artifacts/${feature}/images/${testInfo.project.name}-v2-02-draft.png`, fullPage: false });

    const draft = page.getByLabel("日本語ドラフト");
    const text = await draft.inputValue();
    await draft.fill(`${text.trim()}\n最近は海外の人にもこの話をしたいです。`);
    const saveButton = page.getByRole("button", { name: "下書きを保存" });
    await saveButton.click();
    await expect(saveButton).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByLabel("日本語ドラフト")).toHaveValue(/海外の人/);
    await page.reload();
    await expect(page.getByLabel("日本語ドラフト")).toBeVisible();
    await expect(page.getByLabel("日本語ドラフト")).toHaveValue(/海外の人/);
    await expect(page.locator(".english")).toHaveCount(0);

    await page.getByRole("button", { name: "この内容でいく!" }).click();
    await expect(page.locator(".variant-card")).toHaveCount(3, { timeout: 120_000 });
    await page.screenshot({ path: `.artifacts/${feature}/images/${testInfo.project.name}-v2-03-variants.png`, fullPage: false });
    await page.reload();
    await expect(page.locator(".variant-card")).toHaveCount(3);

    await page.locator(".variant-card").nth(1).click();
    await expect(page.locator(".english")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "録音を開始" })).toBeVisible();
    await page.screenshot({ path: `.artifacts/${feature}/images/${testInfo.project.name}-v2-04-practice.png`, fullPage: false });
  });
});

async function seedUserContext(page: import("@playwright/test").Page, key: string, value: string): Promise<void> {
  const cookie = (await page.context().cookies()).find((item) => item.name === "eb_uid");
  if (!cookie) throw new Error("eb_uid cookie was not created.");
  execSql(`INSERT INTO user_context (user_id, fact_key, fact_value, source, updated_at)
    VALUES (${sql(cookie.value)}, ${sql(key)}, ${sql(value)}, 'manual', datetime('now'))
    ON CONFLICT(user_id, fact_key) DO UPDATE SET fact_value = excluded.fact_value, source = excluded.source, updated_at = excluded.updated_at`);
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
