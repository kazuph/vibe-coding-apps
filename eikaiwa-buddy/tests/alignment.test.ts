import { describe, expect, it } from "vitest";
import { alignWords, normalizeWords } from "../src/shared/alignment";

describe("word normalization and alignment", () => {
  it("normalizes punctuation and common contractions", () => {
    expect(normalizeWords("I'm planning to visit Kyoto next month.")).toEqual(["i", "am", "planning", "to", "visit", "kyoto", "next", "month"]);
  });

  it("marks missing words with LCS alignment", () => {
    const words = alignWords("I like coffee", "I coffee");
    expect(words.map((word) => word.verdict)).toEqual(["ok", "missing", "ok"]);
  });

  it("preserves Gemini word verdicts when provided", () => {
    const words = alignWords("I like rice", "I like lice", [
      { target_word: "rice", verdict: "unclear", heard_as: "lice", advice_ja: "rの舌位置を意識しましょう。" }
    ]);
    expect(words[2]).toMatchObject({ verdict: "unclear", heard_as: "lice" });
  });
});
