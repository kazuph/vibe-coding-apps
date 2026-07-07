import type { WordFeedback, WordVerdict } from "./types";

const contractionMap: Record<string, string[]> = {
  "i'm": ["i", "am"],
  "you're": ["you", "are"],
  "it's": ["it", "is"],
  "that's": ["that", "is"],
  "don't": ["do", "not"],
  "can't": ["can", "not"],
  "won't": ["will", "not"]
};

export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => contractionMap[word] ?? [word.replace(/-/g, "")]);
}

export function alignWords(target: string, heard: string, geminiWords: WordFeedback[] = []): WordFeedback[] {
  const targetWords = normalizeWords(target);
  const heardWords = normalizeWords(heard);
  const dp = buildLcs(targetWords, heardWords);
  const aligned: WordFeedback[] = [];
  let i = targetWords.length;
  let j = heardWords.length;
  const matches = new Map<number, number>();

  while (i > 0 && j > 0) {
    if (targetWords[i - 1] === heardWords[j - 1]) {
      matches.set(i - 1, j - 1);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  targetWords.forEach((word, index) => {
    const gemini = geminiWords.find((item) => normalizeWords(item.target_word)[0] === word);
    const heardIndex = matches.get(index);
    if (gemini) {
      const heardAs = normalizeWords(gemini.heard_as)[0] ?? "";
      const verdict = gemini.verdict === "ok" && heardAs && heardAs !== word ? "unclear" : gemini.verdict;
      aligned.push({ ...gemini, verdict, target_word: word });
      return;
    }
    const verdict: WordVerdict = heardIndex === undefined ? "missing" : "ok";
    aligned.push({
      target_word: word,
      verdict,
      heard_as: heardIndex === undefined ? "" : heardWords[heardIndex],
      advice_ja: verdict === "ok" ? "自然に聞き取れています。" : "この単語が聞き取れませんでした。語尾まで短く切らずに言ってみましょう。"
    });
  });

  return aligned;
}

function buildLcs(a: string[], b: string[]): number[][] {
  const dp = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}
