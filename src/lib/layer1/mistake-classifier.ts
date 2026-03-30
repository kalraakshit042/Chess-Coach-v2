import Anthropic from "@anthropic-ai/sdk";
import type { EvidencePacket, MistakeClassification } from "../types";

const SYSTEM_PROMPT = `You classify chess mistakes from engine analysis data.
Respond ONLY with valid JSON matching this exact schema. No explanation, no markdown.

{
  "primary_category": "tactical" | "positional" | "opening" | "endgame",
  "mistake_type": string,
  "severity": "low" | "medium" | "high" | "blunder",
  "teaching_theme": string
}

Rules:
- severity: cp_loss >= 300 → "blunder", 150-299 → "high", 75-149 → "medium", <75 → "low"
- If tactical_flags is non-empty → primary_category must be "tactical"
- mistake_type: one short phrase (e.g., "missed fork", "weakened king shelter", "premature piece trade")
- teaching_theme: the single most important lesson to learn (e.g., "Check all captures before moving")`;

export async function classifyMistake(
  evidence: EvidencePacket,
  apiKey: string
): Promise<MistakeClassification> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify(evidence),
      },
    ],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  const jsonStr = text
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  return JSON.parse(jsonStr) as MistakeClassification;
}
