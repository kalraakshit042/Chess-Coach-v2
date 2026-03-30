import Anthropic from "@anthropic-ai/sdk";
import type {
  EvidencePacket,
  MistakeClassification,
  BestMoveIntent,
  PlayedMoveFailure,
  CoachExplanation,
  CoachMode,
} from "../types";

const MODE_PREFIXES: Record<CoachMode, string> = {
  tactical: `You are a chess coach specializing in TACTICAL errors.
Focus on: piece coordination, forcing sequences, checks/captures/threats, material counting.
Your explanation must reference the concrete forcing line from pv_best_short.`,

  positional: `You are a chess coach specializing in POSITIONAL errors.
Focus on: pawn structure, piece activity, weak squares, open files, long-term imbalances.
Do NOT cite raw centipawn numbers — explain ideas, not engine scores.`,

  opening: `You are a chess coach specializing in OPENING errors.
Focus on: development principles, center control, king safety, opening-specific plans.
Connect the mistake to what the opening is trying to achieve strategically.`,

  endgame: `You are a chess coach specializing in ENDGAME errors.
Focus on: king activity, pawn promotion races, zugzwang, opposition, technique.
Be concrete about what the correct plan achieves in this specific endgame.`,
};

const BASE_SYSTEM = `Respond ONLY with valid JSON. No markdown fences.

{
  "explanation": string,
  "key_lesson": string,
  "heuristic": string
}

Rules:
- explanation: 2-4 sentences. Must name the played move and best move. Reference theory context if provided.
- key_lesson: ≤ 20 words. What to remember from this mistake.
- heuristic: Actionable rule starting with a verb (e.g., "Scan", "Check", "Calculate", "Ask yourself"). ≤ 15 words.
- Only reference moves in: player_move, best_move, top_moves, pv_best_short, pv_played_short
- Never invent move names`;

function buildSystemPrompt(mode: CoachMode, theoryContext?: string): string {
  const modePrefix = MODE_PREFIXES[mode];
  const theory = theoryContext ? `\n\n${theoryContext}` : "";
  return `${modePrefix}${theory}\n\n${BASE_SYSTEM}`;
}

export async function runCoach(
  evidence: EvidencePacket,
  classification: MistakeClassification,
  intent: BestMoveIntent,
  failure: PlayedMoveFailure,
  mode: CoachMode,
  apiKey: string,
  theoryContext?: string,
  revisionContext?: string
): Promise<CoachExplanation> {
  const client = new Anthropic({ apiKey });

  const userContent = JSON.stringify({
    evidence,
    classification,
    best_move_intent: intent,
    played_move_failure: failure,
    ...(revisionContext ? { revision_guidance: revisionContext } : {}),
  });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 768,
    temperature: 0.3,
    system: buildSystemPrompt(mode, theoryContext),
    messages: [
      {
        role: "user",
        content: userContent,
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

  return JSON.parse(jsonStr) as CoachExplanation;
}
