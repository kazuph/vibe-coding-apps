import type { AttemptEvaluation, CoachResponse, InterviewCoachResponse, UserContextFact } from "../shared/types";
import { coachPrompt, evaluationPrompt, interviewPrompt, ttsPrompt } from "./prompts";

export interface GeminiEnv {
  GEMINI_API_KEY: string;
  GEMINI_COACH_MODEL: string;
  GEMINI_LITE_MODEL: string;
  GEMINI_TTS_MODEL: string;
}

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const coachSchema = {
  type: "OBJECT",
  properties: {
    message_ja: { type: "STRING" },
    topic_suggestions: { type: "ARRAY", nullable: true, items: { type: "STRING" } },
    phrase: {
      type: "OBJECT",
      nullable: true,
      properties: {
        en: { type: "STRING" },
        ja: { type: "STRING" },
        why_ja: { type: "STRING" },
        pronunciation_tips_ja: { type: "ARRAY", items: { type: "STRING" } }
      },
      required: ["en", "ja", "why_ja", "pronunciation_tips_ja"]
    },
    state: { type: "STRING", enum: ["topic", "propose"] }
  },
  required: ["message_ja", "topic_suggestions", "phrase", "state"]
};

const evaluationSchema = {
  type: "OBJECT",
  properties: {
    verbatim: { type: "STRING" },
    words: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          target_word: { type: "STRING" },
          verdict: { type: "STRING", enum: ["ok", "unclear", "wrong", "missing"] },
          heard_as: { type: "STRING" },
          advice_ja: { type: "STRING" }
        },
        required: ["target_word", "verdict", "heard_as", "advice_ja"]
      }
    },
    pronunciation_score: { type: "INTEGER" },
    fluency_score: { type: "INTEGER" },
    prosody_comment_ja: { type: "STRING" },
    overall_advice_ja: { type: "STRING" },
    next_step: { type: "STRING", enum: ["retry", "slow_practice", "next_phrase", "level_up"] }
  },
  required: ["verbatim", "words", "pronunciation_score", "fluency_score", "prosody_comment_ja", "overall_advice_ja", "next_step"]
};

const interviewSchema = {
  type: "OBJECT",
  properties: {
    message_ja: { type: "STRING" },
    chips: { type: "ARRAY", nullable: true, items: { type: "STRING" } },
    draft: {
      type: "OBJECT",
      nullable: true,
      properties: {
        sentences_ja: { type: "ARRAY", items: { type: "STRING" } }
      },
      required: ["sentences_ja"]
    },
    extracted_facts: {
      type: "ARRAY",
      nullable: true,
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING" },
          value: { type: "STRING" }
        },
        required: ["key", "value"]
      }
    }
  },
  required: ["message_ja", "chips", "draft", "extracted_facts"]
};

export async function coach(env: GeminiEnv, level: number, learnerMessage: string, history: string): Promise<CoachResponse> {
  return generateJson<CoachResponse>(env, env.GEMINI_COACH_MODEL, [
    { text: coachPrompt(level) },
    { text: `Conversation history JSON: ${history}` },
    { text: `Learner message: ${learnerMessage}` }
  ], coachSchema);
}

export async function regenerateTopic(env: GeminiEnv, level: number): Promise<CoachResponse> {
  return generateJson<CoachResponse>(env, env.GEMINI_LITE_MODEL, [
    { text: coachPrompt(level) },
    { text: "Create three fresh topic suggestions and a short greeting in Japanese. Do not propose a phrase yet." }
  ], coachSchema);
}

export async function interviewCoach(
  env: GeminiEnv,
  input: {
    level: number;
    topic: string;
    facts: UserContextFact[];
    turnCount: number;
    maxTurns: number;
    mustDraft: boolean;
    forbidDraft: boolean;
    history: string;
    learnerMessage: string;
  }
): Promise<InterviewCoachResponse> {
  return generateJson<InterviewCoachResponse>(env, env.GEMINI_COACH_MODEL, [
    {
      text: interviewPrompt({
        level: input.level,
        topic: input.topic,
        facts: input.facts.map((fact) => ({ key: fact.key, value: fact.value })),
        turnCount: input.turnCount,
        maxTurns: input.maxTurns,
        mustDraft: input.mustDraft,
        forbidDraft: input.forbidDraft
      })
    },
    { text: `Conversation history JSON: ${input.history}` },
    { text: `Learner message: ${input.learnerMessage}` }
  ], interviewSchema);
}

export async function evaluatePronunciation(
  env: GeminiEnv,
  target: string,
  level: number,
  recentAverage: number | null,
  wav: ArrayBuffer
): Promise<AttemptEvaluation> {
  return generateJson<AttemptEvaluation>(env, env.GEMINI_COACH_MODEL, [
    { text: evaluationPrompt(target, level, recentAverage) },
    { inlineData: { mimeType: "audio/wav", data: arrayBufferToBase64(wav) } }
  ], evaluationSchema);
}

export async function synthesizeSpeech(env: GeminiEnv, phrase: string, slow: boolean): Promise<{ mimeType: string; bytes: Uint8Array }> {
  const data = await callGemini(env, env.GEMINI_TTS_MODEL, {
    contents: [{ role: "user", parts: [{ text: ttsPrompt(phrase, slow) }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }
      }
    }
  });
  const part = data.candidates?.[0]?.content?.parts?.find((item: any) => item.inlineData);
  const inline = part?.inlineData;
  if (!inline?.data || !inline?.mimeType) {
    throw new Error("Gemini TTS did not return audio.");
  }
  return { mimeType: inline.mimeType, bytes: base64ToBytes(inline.data) };
}

async function generateJson<T>(env: GeminiEnv, model: string, parts: unknown[], schema: unknown): Promise<T> {
  const data = await callGemini(env, model, {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.4
    }
  });
  const text = data.candidates?.[0]?.content?.parts?.find((part: any) => typeof part.text === "string")?.text;
  if (!text) throw new Error("Gemini returned no JSON text.");
  return JSON.parse(text) as T;
}

async function callGemini(env: GeminiEnv, model: string, body: unknown): Promise<any> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured.");
  if (!["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.1-flash-tts"].includes(model)) {
    throw new Error(`Disallowed Gemini model: ${model}`);
  }
  const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${message.slice(0, 500)}`);
  }
  return response.json();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
