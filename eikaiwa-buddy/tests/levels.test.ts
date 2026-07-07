import { describe, expect, it } from "vitest";
import { decideNextStep, nextLevel, shouldEasePhrase } from "../src/shared/levels";

describe("level engine", () => {
  it("uses the fixed score boundaries", () => {
    expect(decideNextStep(49, [])).toBe("retry");
    expect(decideNextStep(50, [])).toBe("slow_practice");
    expect(decideNextStep(69, [])).toBe("slow_practice");
    expect(decideNextStep(70, [])).toBe("next_phrase");
  });

  it("proposes level up when the latest five average is at least 80", () => {
    expect(decideNextStep(82, [80, 81, 79, 80])).toBe("level_up");
  });

  it("detects three consecutive low scores for easier phrases", () => {
    expect(shouldEasePhrase([68, 49, 45, 30])).toBe(true);
    expect(shouldEasePhrase([49, 51, 45])).toBe(false);
  });

  it("caps levels between 1 and 5", () => {
    expect(nextLevel(4)).toBe(5);
    expect(nextLevel(5)).toBe(5);
  });
});
