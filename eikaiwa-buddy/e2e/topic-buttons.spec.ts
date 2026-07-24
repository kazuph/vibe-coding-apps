import { expect, test } from "@playwright/test";

test.describe("topic picker UI", () => {
  test("shows concise topic labels without wrapping", async ({ page }, testInfo) => {
    const feature = "eikaiwa-buddy";
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "今日は何を一緒に作る？" })).toBeVisible();
    await expect(page.getByText("自己紹介を一緒に作る")).toHaveCount(0);

    const labels = ["自己紹介", "仕事の話", "旅行の会話", "週末の話", "好きなもの", "趣味の話"];
    for (const label of labels) {
      const button = page.getByRole("button", { name: label });
      await expect(button).toBeVisible();
      await expect(button).toHaveCSS("white-space", "nowrap");
    }

    await page.screenshot({ path: `.artifacts/${feature}/images/${testInfo.project.name}-topic-buttons-v2-fix.png`, fullPage: false });
  });
});
