import Anthropic from "@anthropic-ai/sdk";
import type { LessonCard, PatternAggregation, ImprovementPlan } from "../types";

const SYSTEM_PROMPT = `You are a chess coach writing a personalized improvement plan.
Given a set of analyzed mistakes and pattern data, produce a structured study plan.
Respond ONLY with valid JSON. No markdown fences.

{
  "top_weaknesses": string[],
  "reliable_areas": string[],
  "low_trust_areas": string[],
  "study_plan": string
}

Rules:
- top_weaknesses: 2-4 specific recurring problems found in this opening (name the opening)
- reliable_areas: 1-3 things the player actually did well (derive from low cp_loss cards, if any)
- low_trust_areas: categories/positions where coach confidence was red/yellow — note uncertainty
- study_plan: 3-5 sentence paragraph with concrete next steps (specific puzzles, resources, or drills)
- Be honest: if all positions had low confidence, say so
- Keep it encouraging but accurate`;

export async function generateImprovementPlan(
  cards: LessonCard[],
  patterns: PatternAggregation,
  openingName: string,
  apiKey: string
): Promise<ImprovementPlan> {
  const client = new Anthropic({ apiKey });

  // Build a compact summary for the prompt — avoid sending all full cards
  const cardSummaries = cards.map((c) => ({
    severity: c.severity,
    category: c.category,
    mistake_type: c.mistake_type,
    teaching_theme: c.teaching_theme,
    cp_loss: c.cp_loss,
    coach_confidence: c.coach_confidence,
    key_lesson: c.key_lesson,
  }));

  const userContent = JSON.stringify({
    opening: openingName,
    patterns,
    card_summaries: cardSummaries,
  });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  const jsonStr = text
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  return JSON.parse(jsonStr) as ImprovementPlan;
}
