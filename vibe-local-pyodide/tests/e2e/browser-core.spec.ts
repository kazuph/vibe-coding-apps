import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const apiBaseUrl =
  process.env.VIBE_LOCAL_TEST_API_BASE_URL ??
  "http://ubuntu-3090.tail5f04b.ts.net:8031/v1";

const repoRoot = path.resolve(process.cwd(), "..");

async function waitForFileContent(filePath: string, expected: string) {
  await expect
    .poll(async () => {
      try {
        return await readFile(filePath, "utf8");
      } catch {
        return "";
      }
    }, { timeout: 60_000 })
    .toBe(expected);
}

async function configureAgent(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Show settings" }).first().click();
  await page.getByLabel("Base URL").fill(apiBaseUrl);
  await page.getByRole("button", { name: "Refresh models" }).click();
  await expect(page.getByText(/モデルを \d+ 件取得しました。/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel("Model")).not.toHaveValue("", {
    timeout: 30_000,
  });
  await page.getByLabel("Directory").selectOption("vibe-local-pyodide");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Backend settings を保存しました。")).toBeVisible();

  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByText("新しいセッションを作成しました。")).toBeVisible();
}

test.describe("vibe-local browser core", () => {
  test("chat-first ui keeps coding controls out of the main surface", async ({ page }) => {
    test.setTimeout(120_000);

    const uniquePrompt = `選択中の directory の scripts を確認して、check があるか短く教えて。${Date.now()}`;
    const relativePlanFile = `tools/agentos-dev/.agentos-dev/workspace/e2e-plan-${Date.now()}.txt`;
    const absolutePlanFile = path.join(repoRoot, relativePlanFile);
    const planContent = `plan-${Date.now()}`;

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "vibe-local Pyodide" })).toBeVisible();
    await expect(page.locator(".status-chip")).toHaveText("agentOS actor");
    await expect(page.locator(".chat-panel > .section-head").getByText("Chat")).toBeVisible();
    await expect(page.getByText("Agent controls")).toHaveCount(0);
    await expect(page.getByText("Project workspace")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run parallel agents" })).toHaveCount(0);

    await page.getByRole("button", { name: "Show settings" }).first().click();
    await page.getByLabel("Base URL").fill(apiBaseUrl);
    await expect(page.getByRole("spinbutton", { name: "Max tokens" })).toHaveValue(/^[4-9]\d{3,}$/);
    await expect(page.getByText("4,096")).toBeVisible();
    await expect(page.getByText("65,536")).toBeVisible();
    await page.getByRole("button", { name: "Refresh models" }).click();
    await expect(page.getByText(/モデルを \d+ 件取得しました。/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByLabel("Model")).not.toHaveValue("", {
      timeout: 30_000,
    });
    await page.getByLabel("Directory").selectOption("vibe-local-pyodide");
    await page.getByLabel("Mode", { exact: true }).selectOption("plan");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Backend settings を保存しました。")).toBeVisible();
    await page.getByRole("button", { name: "Hide settings" }).last().click();
    await expect(page.getByLabel("Base URL")).toHaveCount(0);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".status-chip")).toHaveText("agentOS actor");
    await expect(page.getByRole("button", { name: "Show settings" }).first()).toBeVisible();
    await expect(page.getByLabel("Base URL")).toHaveCount(0);
    await page.getByRole("button", { name: "Show settings" }).first().click();

    await page.getByRole("button", { name: "New", exact: true }).click();
    await expect(page.getByText("新しいセッションを作成しました。")).toBeVisible();

    await page
      .getByPlaceholder("例: vibe-local の transcript compaction をどう改善する？")
      .fill(`${relativePlanFile} に ${planContent} とだけ書いて`);
    await page.getByRole("button", { name: "Plan run" }).click();

    await expect(page.locator(".message-bubble.role-user").getByText(relativePlanFile)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByLabel("Pending approvals")).toContainText("writeFile", {
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "Approve" }).first().click();
    await expect(page.getByText("Approve tool を完了しました。")).toBeVisible({
      timeout: 60_000,
    });
    await waitForFileContent(absolutePlanFile, planContent);
    await expect(page.getByLabel("Pending approvals")).toHaveCount(0);

    await page.getByLabel("Mode", { exact: true }).selectOption("act");
    await expect(page.getByText("Act mode に切り替えました。")).toBeVisible();

    let delayNextAgentRun = true;
    await page.route("**/__vibe_local/agentos/session/agent-run", async (route) => {
      if (!delayNextAgentRun) {
        await route.continue();
        return;
      }
      delayNextAgentRun = false;
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.fulfill({ response });
    });

    await page.getByPlaceholder("例: vibe-local の transcript compaction をどう改善する？").fill(uniquePrompt);
    await page.getByRole("button", { name: "Act run" }).click();

    await expect(page.locator(".message-bubble.role-user").getByText(uniquePrompt)).toBeVisible({
      timeout: 2_000,
    });
    await expect(page.locator(".message-bubble.role-user p").filter({ hasText: uniquePrompt })).toHaveCount(1, {
      timeout: 60_000,
    });
    await expect
      .poll(async () => await page.locator(".tool-event-card").count(), {
        timeout: 60_000,
      })
      .toBeGreaterThan(0);
    await page.locator(".tool-event-card").first().evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
    await expect(page.locator(".tool-event-card .tool-trace-command code").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect
      .poll(async () => await page.locator(".message-bubble.role-assistant").count(), {
        timeout: 60_000,
      })
      .toBeGreaterThan(0);
    const latestAssistantBubble = page.locator(".message-bubble.role-assistant").last();
    await expect(latestAssistantBubble).not.toContainText(/^$/);
    await expect(page.getByText(/agentOS coding agent が .* tool を使って応答しました。/)).toBeVisible({
      timeout: 60_000,
    });
    await page.getByLabel("Mode", { exact: true }).selectOption("yolo");
    await expect(page.getByText("YOLO mode に切り替えました。")).toBeVisible();
    await expect(page.getByRole("button", { name: "YOLO run" })).toBeVisible();
  });

  test("shows a visible error when agent-run returns an empty response", async ({ page }) => {
    test.setTimeout(120_000);

    const failedPrompt = `空レス検証 ${Date.now()}`;

    await configureAgent(page);
    await page.getByLabel("Mode", { exact: true }).selectOption("yolo");
    await expect(page.getByText("YOLO mode に切り替えました。")).toBeVisible();

    await page.route("**/__vibe_local/agentos/session/agent-run", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "",
      });
    });

    await page.getByPlaceholder("例: vibe-local の transcript compaction をどう改善する？").fill(failedPrompt);
    await page.getByRole("button", { name: "YOLO run" }).click();

    await expect(page.locator(".message-bubble.role-user").getByText(failedPrompt)).toBeVisible({
      timeout: 2_000,
    });
    await expect(page.getByText("agentOS coding agent から空のレスポンスが返りました。")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator(".message-bubble.role-user p").filter({ hasText: failedPrompt })).toHaveCount(1);
  });
});
