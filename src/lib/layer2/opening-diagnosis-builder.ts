/**
 * Opening diagnosis builder
 *
 * Takes diff results across multiple games + any Stockfish cards from the
 * opening phase, and produces a single OpeningDiagnosis: a one-sentence
 * summary of what the player misunderstands about this opening, backed by
 * 2-3 concrete evidence positions.
 *
 * This is the primary output for opening-level coaching.
 * Individual lesson cards serve as supporting evidence, not the main message.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  OpeningTheory,
  OpeningDiffResult,
  OpeningDiagnosis,
  LessonCard,
  CriticalJunction,
} from "../types";

// ─── Evidence selection ───────────────────────────────────────────────────────

interface EvidencePosition {
  fen: string;
  move_number: number;
  player_move: string;
  correct_move: string;
  explanation: string;
}

function selectEvidence(
  diffResults: Map<string, OpeningDiffResult>,
  openingPhaseCards: LessonCard[],
  theory: OpeningTheory
): EvidencePosition[] {
  const evidence: EvidencePosition[] = [];

  // Priority 1: junction deviations — these are structural, no engine needed
  for (const [, result] of diffResults) {
    if (result.status !== "deviated_at_junction") continue;
    if (evidence.length >= 3) break;

    const junction: CriticalJunction = result.junction;
    evidence.push({
      fen: junction.fen,
      move_number: result.move_number,
      player_move: result.played_move,
      correct_move: junction.correct_responses[0] ?? "?",
      explanation: junction.mistake_explanation,
    });
  }

  // Priority 2: opening-phase Stockfish blunders as additional evidence
  for (const card of openingPhaseCards) {
    if (evidence.length >= 3) break;
    // Avoid duplicating a position already added from junction deviations
    if (evidence.some((e) => e.fen === card.fen)) continue;

    evidence.push({
      fen: card.fen,
      move_number: parseInt(card.position_id.split("_move")[1] ?? "0", 10),
      player_move: card.player_move,
      correct_move: card.best_move,
      explanation: card.key_lesson,
    });
  }

  // Priority 3: transition_move as a structural signal when nothing else found
  if (evidence.length === 0 && theory.resulting_structure && theory.transition_move) {
    evidence.push({
      fen: "",
      move_number: theory.transition_move,
      player_move: "(various)",
      correct_move: "(see plan)",
      explanation: `The resulting structure (${theory.resulting_structure}) demands: ${theory.structure_demands?.[0] ?? "active piece play"}.`,
    });
  }

  return evidence;
}

// ─── Dominant diff result ─────────────────────────────────────────────────────

function dominantDiffResult(diffResults: Map<string, OpeningDiffResult>): OpeningDiffResult {
  const counts = { deviated_at_junction: 0, correct_moves_wrong_plan: 0, followed_theory: 0, no_theory_available: 0 };
  let mostCommonJunction: CriticalJunction | null = null;
  let mostCommonJunctionMove = "";
  let mostCommonJunctionMoveNumber = 0;

  for (const result of diffResults.values()) {
    counts[result.status]++;
    if (result.status === "deviated_at_junction" && !mostCommonJunction) {
      mostCommonJunction = result.junction;
      mostCommonJunctionMove = result.played_move;
      mostCommonJunctionMoveNumber = result.move_number;
    }
  }

  if (counts.deviated_at_junction >= counts.correct_moves_wrong_plan && mostCommonJunction) {
    return {
      status: "deviated_at_junction",
      junction: mostCommonJunction,
      played_move: mostCommonJunctionMove,
      move_number: mostCommonJunctionMoveNumber,
    };
  }
  if (counts.correct_moves_wrong_plan > 0) {
    const sample = [...diffResults.values()].find((r) => r.status === "correct_moves_wrong_plan");
    return sample!;
  }
  if (counts.followed_theory > 0) {
    return { status: "followed_theory", last_theory_move: 0 };
  }
  return { status: "no_theory_available" };
}

// ─── Claude diagnosis call ────────────────────────────────────────────────────

async function generateDiagnosis(
  eco: string,
  openingName: string,
  theory: OpeningTheory,
  diffCounts: Record<string, number>,
  totalGames: number,
  dominantResult: OpeningDiffResult,
  evidence: EvidencePosition[],
  apiKey: string
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const prompt = {
    opening: `${openingName} (${eco})`,
    games_analyzed: totalGames,
    deviation_summary: diffCounts,
    dominant_result: dominantResult,
    evidence_positions: evidence,
    theory_context: {
      transition_move: theory.transition_move,
      resulting_structure: theory.resulting_structure,
      structure_demands: theory.structure_demands,
    },
  };

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    temperature: 0.2,
    system: `You are a chess coach writing a one-sentence opening diagnosis.
The sentence must:
- Name the opening
- State the most common failure mode across the player's games (be specific about the move or pattern)
- State what understanding is missing
- Sound direct, not encouraging or softened
Respond ONLY with valid JSON: { "diagnosis": string }`,
    messages: [{ role: "user", content: JSON.stringify(prompt) }],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  const jsonStr = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return (JSON.parse(jsonStr) as { diagnosis: string }).diagnosis;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function buildOpeningDiagnosis(
  eco: string,
  openingName: string,
  theory: OpeningTheory,
  diffResults: Map<string, OpeningDiffResult>,
  openingPhaseCards: LessonCard[],
  apiKey: string
): Promise<OpeningDiagnosis> {
  const counts = { deviated_at_junction: 0, correct_moves_wrong_plan: 0, followed_theory: 0, no_theory_available: 0 };
  for (const r of diffResults.values()) counts[r.status]++;

  const dominant = dominantDiffResult(diffResults);
  const evidence = selectEvidence(diffResults, openingPhaseCards, theory);

  const diagnosis = await generateDiagnosis(
    eco, openingName, theory, counts, diffResults.size, dominant, evidence, apiKey
  );

  return {
    eco,
    opening_name: openingName,
    diff_result: dominant,
    diagnosis,
    evidence_positions: evidence,
  };
}
