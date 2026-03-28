import Anthropic from "@anthropic-ai/sdk";
import type { EvidencePacket, PlayedMoveFailure } from "../types";

const SYSTEM_PROMPT = `You explain why the player's chess move failed.
Respond ONLY with valid JSON. No explanation, no markdown fences.

{
  "what_was_missed": string,
  "concrete_consequence": string,
  "root_cause": string
}

Rules:
- what_was_missed: what tactical/strategic element the player overlooked (must name player_move exactly)
- concrete_consequence: what actually goes wrong after the played move (measurable if possible — e.g., "loses the e5 pawn")
- root_cause: the underlying thinking error (e.g., "moved attacking piece without checking opponent's responses")
- Only reference moves that appear in best_move, player_move, top_moves, pv_best_short, or pv_played_short
- Never invent move names or board states not derivable from the evidence`;

export async function analyzePlayedMoveFailure(
  evidence: EvidencePacket,
  apiKey: string
): Promise<PlayedMoveFailure> {
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

  return JSON.parse(jsonStr) as PlayedMoveFailure;
}
