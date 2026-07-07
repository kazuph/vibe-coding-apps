import type { NextStep } from "./types";

export const LEVEL_TABLE = [
  { level: 1, label: "L1 入門", words: "3-5語", grammar: "be動詞・定型句" },
  { level: 2, label: "L2 初級", words: "6-8語", grammar: "現在/過去形" },
  { level: 3, label: "L3 初中級", words: "8-12語", grammar: "接続詞・理由" },
  { level: 4, label: "L4 中級", words: "12語以上", grammar: "意見・比較・仮定" },
  { level: 5, label: "L5 上級", words: "自由会話", grammar: "追い質問で続ける" }
] as const;

export function decideNextStep(score: number, recentScores: number[]): NextStep {
  const lastFive = [...recentScores.slice(-4), score];
  const avg = average(lastFive);
  if (lastFive.length >= 5 && avg >= 80) return "level_up";
  if (score < 50) return "retry";
  if (score < 70) return "slow_practice";
  return "next_phrase";
}

export function shouldEasePhrase(recentScores: number[]): boolean {
  return recentScores.slice(-3).length === 3 && recentScores.slice(-3).every((score) => score < 50);
}

export function nextLevel(current: number): number {
  return Math.min(5, Math.max(1, current + 1));
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
