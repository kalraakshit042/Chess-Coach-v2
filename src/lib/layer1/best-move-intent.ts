import Anthropic from "@anthropic-ai/sdk";
import type { EvidencePacket, BestMoveIntent } from "../types";

const SYSTEM_PROMPT = `You explain what the best chess move was trying to accomplish.
Respond ONLY with valid JSON. No explanation, no markdown fences.

{
  "immediate_goal": string,
  "strategic_purpose": string,
  "why_better_than_played": string
}

Rules:
- immediate_goal: what the best move does tactically RIGHT NOW (must name the move exactly as given in best_move)
- strategic_purpose: the longer-term plan it supports (1 sentence)
- why_better_than_played: concrete reason the best move outperforms the played move (name both moves)
- Only reference moves that appear in best_move, player_move, top_moves, pv_best_short, or pv_played_short
- Never invent move names. If uncertain about a continuation, omit it.`;

export async function analyzeBestMoveIntent(
  evidence: EvidencePacket,
  apiKey: string
): Promise<BestMoveIntent> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
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

  return JSON.parse(jsonStr) as BestMoveIntent;
}
