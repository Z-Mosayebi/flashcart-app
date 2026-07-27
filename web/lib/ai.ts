/**
 * Thin client for the Python AI service. Kept separate from route handlers so
 * the AI-service base URL and error handling live in one place.
 */

const AI_BASE = process.env.AI_SERVICE_URL || "http://localhost:8000";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${AI_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI service ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

export interface EvaluateAnswerRequest {
  cardPrompt: string;
  expectedAnswer: string;
  userAnswer: string;
  grammarPattern?: string;
  explanation?: string;
}

export interface EvaluateAnswerResponse {
  result: "CORRECT" | "PARTIAL" | "INCORRECT";
  feedback: string;
  errorTags: string[];
  difficulty: number; // 0..1
}

export function evaluateAnswer(req: EvaluateAnswerRequest) {
  return post<EvaluateAnswerResponse>("/tutor/evaluate", req);
}

export interface GenerateCardsRequest {
  rawMarkdown: string;
  sourceDocumentTitle: string;
}

export interface GeneratedCard {
  type: "CLOZE" | "SENTENCE_PRODUCTION" | "GRAMMAR_QA" | "ERROR_CORRECTION" | "VOCAB";
  topicName: string;
  topicPattern?: string;
  prompt: string;
  answer: string;
  explanation?: string;
  hints: string[];
  sourceText?: string;
}

export function generateCards(req: GenerateCardsRequest) {
  return post<{ cards: GeneratedCard[] }>("/generate/cards", req);
}

export interface TutorChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TutorChatRequest {
  topicName: string;
  topicPattern?: string;
  history: TutorChatMessage[];
  userMessage: string;
}

export interface TutorChatResponse {
  reply: string;
  /** The tutor sets this once the learner has produced the pattern reliably. */
  mastered: boolean;
}

export function tutorChat(req: TutorChatRequest) {
  return post<TutorChatResponse>("/tutor/chat", req);
}
