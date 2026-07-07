export type AppState = "topic" | "propose" | "practice" | "feedback";
export type NextStep = "retry" | "slow_practice" | "next_phrase" | "level_up";
export type WordVerdict = "ok" | "unclear" | "wrong" | "missing";

export interface Phrase {
  en: string;
  ja: string;
  why_ja: string;
  pronunciation_tips_ja: string[];
}

export interface CoachResponse {
  message_ja: string;
  topic_suggestions: string[] | null;
  phrase: Phrase | null;
  state: "topic" | "propose";
}

export interface WordFeedback {
  target_word: string;
  verdict: WordVerdict;
  heard_as: string;
  advice_ja: string;
}

export interface AttemptEvaluation {
  verbatim: string;
  words: WordFeedback[];
  pronunciation_score: number;
  fluency_score: number;
  prosody_comment_ja: string;
  overall_advice_ja: string;
  next_step: NextStep;
}

export interface SessionPayload {
  user: { id: string; level: number };
  session: {
    id: string;
    state: AppState;
    topic: string | null;
    current_phrase: Phrase | null;
    chat_history: ChatMessage[];
  };
  progress: ProgressPayload;
}

export interface ChatMessage {
  role: "coach" | "learner";
  text: string;
  created_at: string;
}

export interface ProgressPayload {
  level: number;
  attempts: number;
  average_score: number | null;
  best_score: number | null;
  recent: Array<{ phrase_en: string; score: number; next_step: NextStep; created_at: string }>;
}
