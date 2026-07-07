import { expect, test } from "@playwright/test";
import path from "node:path";
import { fakeMicArgs, runHelloAttempt } from "./audio-helper";

test.setTimeout(240_000);
test.use({ launchOptions: { args: fakeMicArgs(path.resolve("fixtures/hello-accented.wav")) } });

test("accented fixture receives a lower practice score through the real Gemini API", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "audio fixture verification runs once on desktop Chrome");
  const score = await runHelloAttempt(page, "accented");
  await page.close();
  expect(score).toBeLessThan(70);
});
