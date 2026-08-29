import OpenAI from "openai";
import {
  CLASSIFIER_LABELS,
  buildClassifierEmailContent,
  CLASSIFIER_SYSTEM_PROMPT,
  classifyEmail,
  type ClassificationResult,
  type ClassifierInput,
} from "./classifier.js";

export interface LLMClassifierDeps {
  callLLM: (input: ClassifierInput) => Promise<string>;
}

let cachedClient: OpenAI | null = null;

// Constructed lazily, not at import time, so this module can be imported in
// tests (and by anything that doesn't need the real LLM path) without an
// OPENAI_API_KEY being set.
function getOpenAIClient(): OpenAI {
  if (!cachedClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set — cannot call the real classifier model.");
    }
    cachedClient = new OpenAI({ apiKey });
  }
  return cachedClient;
}

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: CLASSIFIER_LABELS },
    confidence: { type: "number" },
    rationale: { type: "string" },
  },
  required: ["kind", "confidence", "rationale"],
  additionalProperties: false,
} as const;

/**
 * The real network call. `response_format: json_schema` with `strict: true`
 * makes the API itself reject any response that doesn't match the six
 * labels — this is enforced twice: once by OpenAI before it ever reaches
 * us, and again by `parseLLMClassifierOutput` below, which trusts nothing
 * about the network regardless of what the API claims to guarantee.
 */
export function buildOpenAIClassifierMessages(input: ClassifierInput) {
  return [
    { role: "system" as const, content: CLASSIFIER_SYSTEM_PROMPT },
    { role: "user" as const, content: buildClassifierEmailContent(input) },
  ];
}

async function callOpenAI(input: ClassifierInput): Promise<string> {
  const model = process.env.CLASSIFIER_MODEL;
  if (!model) {
    throw new Error("CLASSIFIER_MODEL is not set — cannot call the real classifier model.");
  }
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model,
    messages: buildOpenAIClassifierMessages(input),
    response_format: {
      type: "json_schema",
      json_schema: { name: "email_classification", schema: RESPONSE_JSON_SCHEMA, strict: true },
    },
  });
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty classification response.");
  }
  return content;
}

/**
 * Validates the model's JSON against the same contract as the rule-based
 * classifier (six known labels, confidence in [0, 1]) — never trusts the
 * API's own "strict" claim. Returns null on anything malformed so the
 * caller can fall back rather than propagate a bad label into the queue.
 */
export function parseLLMClassifierOutput(raw: string): Omit<ClassificationResult, "injectionDetected" | "injectionEvidence"> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { kind, confidence, rationale } = parsed as Record<string, unknown>;

  if (typeof kind !== "string" || !(CLASSIFIER_LABELS as readonly string[]).includes(kind)) return null;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  if (typeof rationale !== "string" || rationale.trim() === "") return null;

  return { kind: kind as ClassificationResult["kind"], confidence, rationale };
}

/**
 * The production classifier: rule-based injection scan first (fast, free,
 * and cannot itself be talked out of its job by clever wording), then the
 * real LLM call for the actual 6-way label — only reached once the
 * injection scan has already cleared the email. Any failure on the LLM
 * side (network error, bad JSON, a label outside the schema) falls back to
 * the rule-based classifier's own answer rather than guessing or throwing:
 * a degraded-but-safe result beats blocking the queue or inventing a label.
 */
export async function classifyEmailWithLLM(
  input: ClassifierInput,
  deps: LLMClassifierDeps = { callLLM: callOpenAI },
): Promise<ClassificationResult> {
  const ruleBasedResult = classifyEmail(input);
  if (ruleBasedResult.injectionDetected) {
    return ruleBasedResult;
  }

  try {
    const raw = await deps.callLLM(input);
    const parsed = parseLLMClassifierOutput(raw);
    if (!parsed) {
      throw new Error("LLM response failed validation.");
    }
    return { ...parsed, injectionDetected: false, injectionEvidence: [] };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ...ruleBasedResult,
      rationale: `LLM classification unavailable (${reason}) — used rule-based fallback: ${ruleBasedResult.rationale}`,
    };
  }
}
