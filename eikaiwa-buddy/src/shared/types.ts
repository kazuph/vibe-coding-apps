export type AppState = "topic" | "propose" | "interview" | "draft" | "variants" | "practice" | "feedback" | "script_done";
export type ScriptStatus = "interview" | "draft" | "practicing" | "complete";
export type NextStep = "retry" | "slow_practice" | "next_phrase" | "level_up";
export type WordVerdict = "ok" | "unclear" | "wrong" | "missing";
export type VariantStyle = "simple" | "natural" | "advanced";

export interface Phrase {
  en: string;
  ja: string;
  why_ja: string;
  pronunciation_tips_ja: string[];
}

export interface UserContextFact {
  key: string;
  value: string;
  source: "onboarding" | "interview" | "manual";
}

export interface InterviewState {
  version: 2;
  turn_count: number;
  max_turns: number;
  last_question_ja: string | null;
  chips: string[];
  draft_sentences_ja: string[];
  approved_at: string | null;
}

export interface VariantTrap {
  word: string;
  tip_ja: string;
}

export interface EnglishVariant {
  style: VariantStyle;
  en: string;
  why_ja: string;
  traps: VariantTrap[];
}

export interface ScriptSentencePayload {
  id: number;
  position: number;
  ja_text: string;
  variants: EnglishVariant[];
  en_selected: string | null;
  best_score: number;
  practice_count: number;
}

export interface ScriptPayload {
  id: string;
  topic: string;
  audience: string | null;
  status: ScriptStatus;
  interview: InterviewState | null;
  sentences: ScriptSentencePayload[];
}

export interface CoachResponse {
  message_ja: string;
  topic_suggestions: string[] | null;
  phrase: Phrase | null;
  state: "topic" | "propose";
}

export interface InterviewCoachResponse {
  message_ja: string;
  chips: string[] | null;
  draft: { sentences_ja: string[] } | null;
  extracted_facts: Array<{ key: string; value: string }> | null;
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
    phase: AppState;
    topic: string | null;
    script_id: string | null;
    active_sentence_position: number;
    current_phrase: Phrase | null;
    script: ScriptPayload | null;
    active_sentence: ScriptSentencePayload | null;
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
