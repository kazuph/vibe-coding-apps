import { expect, test } from "@playwright/test";

const apiBaseUrl =
  process.env.VIBE_LOCAL_TEST_API_BASE_URL ??
  "http://ubuntu-3090.tail5f04b.ts.net:8031/v1";

test.describe("vibe-local browser core", () => {
  test("settings, persistence, and one chat turn work", async ({ page }) => {
    test.setTimeout(120_000);

    const uniquePrompt = `選択中の project の scripts を確認して、check があるか短く教えて。${Date.now()}`;
    const planFile = `tools/agentos-dev/.agentos-dev/workspace/e2e-plan-${Date.now()}.txt`;
    const planContent = `plan-${Date.now()}`;

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "vibe-local Pyodide" })).toBeVisible();
    await expect(page.getByText("Backend settings")).toBeVisible();
    await expect(page.locator(".status-chip")).toHaveText("agentOS actor");
    await expect(page.locator(".coding-panel > .section-head").getByText("Coding workspace")).toBeVisible();

    await page.getByLabel("Project").selectOption("vibe-local-pyodide");
    await expect(page.locator(".coding-panel > .project-summary strong")).toHaveText("@kazuph/vibe-local-pyodide");

    await page.getByLabel("Repo search").fill("agentOS actor");
    await page.getByRole("button", { name: "Search code" }).click();
    await expect(page.getByLabel("Search results")).toContainText("agentOS actor");

    const mainToolOutput = (title: string) =>
      page.locator(".tool-output").filter({
        has: page.locator(".section-head").filter({ hasText: title }),
      });

    await page.locator(".tool-actions").getByRole("button", { name: "Git status" }).click();
    await expect(mainToolOutput("Git status").locator("pre")).toContainText("Branch:");

    await page.getByLabel("Script").selectOption("check");
    await page.locator(".tool-actions").getByRole("button", { name: "Run script" }).click();
    await expect(page.getByText("Run script を完了しました。")).toBeVisible({
      timeout: 60_000,
    });
    await expect(mainToolOutput("Run script").locator("pre")).toContainText("Exit code: 0", {
      timeout: 60_000,
    });

    const scratchPath = "tools/agentos-dev/.agentos-dev/workspace/e2e-browser-note.txt";
    const scratchContent = `browser-write-${Date.now()}`;
    await page.getByLabel("File path").fill(scratchPath);
    await page.getByLabel("File editor").fill(scratchContent);
    await page.locator(".tool-actions").getByRole("button", { name: "Save file" }).click();
    await expect(page.getByText("Save file を完了しました。")).toBeVisible({
      timeout: 60_000,
    });
    await expect(mainToolOutput("Save file").locator("pre")).toContainText(scratchPath);

    await page.locator(".tool-actions").getByRole("button", { name: "Open file" }).click();
    await expect(page.getByLabel("File editor")).toHaveValue(scratchContent);

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

    await page.getByRole("button", { name: "New", exact: true }).click();
    await expect(page.getByText("新しいセッションを作成しました。")).toBeVisible();

    await page.getByLabel("Mode", { exact: true }).selectOption("plan");
    await expect(page.getByText("Plan mode に切り替えました。")).toBeVisible();
    await page
      .getByPlaceholder("例: vibe-local の transcript compaction をどう改善する？")
      .fill(`${planFile} に ${planContent} とだけ書いて`);
    await page.getByRole("button", { name: "Plan run" }).click();
    await expect(page.locator(".message-bubble.role-user").getByText(planFile)).toBeVisible();
    await expect(page.getByText("agentOS coding agent が approval 待ちの操作を提案しました。")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByLabel("Pending approvals")).toContainText("writeFile", {
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "Approve" }).first().click();
    await expect(page.getByText("Approve tool を完了しました。")).toBeVisible({
      timeout: 60_000,
    });
    await page.getByLabel("File path").fill(planFile);
    await page.locator(".tool-actions").getByRole("button", { name: "Open file" }).click();
    await expect(page.getByLabel("File editor")).toHaveValue(planContent);

    await page.getByLabel("Mode", { exact: true }).selectOption("act");
    await expect(page.getByText("Act mode に切り替えました。")).toBeVisible();

    await page.getByPlaceholder("例: vibe-local の transcript compaction をどう改善する？").fill(uniquePrompt);
    await page.getByRole("button", { name: "Act run" }).click();

    await expect(page.locator(".message-bubble.role-user").getByText(uniquePrompt)).toBeVisible();

    await expect
      .poll(async () => await page.locator(".message-bubble.role-assistant").count(), {
        timeout: 60_000,
      })
      .toBeGreaterThan(0);
    await expect(page.locator(".message-bubble.role-assistant").last()).not.toContainText(/^$/);
    await expect(mainToolOutput("Agent run").locator("pre")).toContainText("#1 projectInfo", {
      timeout: 60_000,
    });
    await expect(mainToolOutput("Agent run").locator("pre")).toContainText("Final response", {
      timeout: 60_000,
    });
    await expect(page.getByText(/agentOS coding agent が .* tool を使って応答しました。/)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole("button", { name: "Act run" })).toBeEnabled();

    await page
      .getByLabel("Parallel prompts")
      .fill("README.md を1行で要約して\n--\nvibe-local-pyodide の scripts を短く整理して");
    await page.getByRole("button", { name: "Run parallel agents" }).click();
    await expect(page.getByText("Parallel agents を完了しました。")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByLabel("Sub-agent runs")).toContainText("README.md を1行で要約して", {
      timeout: 60_000,
    });
    await expect(page.getByLabel("Sub-agent runs")).toContainText("completed", {
      timeout: 60_000,
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".status-chip")).toHaveText("agentOS actor");
    await expect(page.getByLabel("Base URL")).toHaveValue(apiBaseUrl);
    const sessionCount = await page.locator(".session-card").count();
    expect(sessionCount).toBeGreaterThanOrEqual(1);
    await expect(page.getByText("承認待ちの tool はありません。")).toBeVisible();
    await expect(
      page.locator(".message-bubble.role-user p").filter({ hasText: uniquePrompt }).last(),
    ).toBeVisible();
    await expect(page.locator(".message-bubble.role-assistant").last()).toBeVisible();
  });
});
