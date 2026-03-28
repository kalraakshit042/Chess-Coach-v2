/**
 * Eval: best-move-intent + played-move-failure agents
 * Run: pnpm test:evals -- move-agents
 *
 * Critical check: no hallucinated move names.
 * All moves referenced must appear in the evidence packet.
 */

import { describe, it, expect } from "vitest";
import { analyzeBestMoveIntent } from "../lib/layer1/best-move-intent";
import { analyzePlayedMoveFailure } from "../lib/layer1/played-move-failure";
import { FIXTURES } from "./fixtures/positions";
import type { EvidencePacket } from "../lib/types";

const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

// Chess move token pattern: piece + square or pawn capture or castling
const MOVE_TOKEN = /\b([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8][+#]?|O-O(?:-O)?)\b/g;

function extractMoveTokens(text: string): string[] {
  return [...text.matchAll(MOVE_TOKEN)].map((m) => m[0].replace(/[+#]/, ""));
}

function getAllowedMoves(evidence: EvidencePacket): Set<string> {
  return new Set([
    evidence.best_move,
    evidence.player_move,
    ...evidence.top_moves,
    ...evidence.pv_best_short,
    ...evidence.pv_played_short,
  ].map((m) => m.replace(/[+#]/, "")));
}

function noHallucinatedMoves(text: string, evidence: EvidencePacket): boolean {
  const mentioned = extractMoveTokens(text);
  const allowed = getAllowedMoves(evidence);
  return mentioned.every((m) => allowed.has(m));
}

describe("best-move-intent eval", () => {
  for (const fixture of FIXTURES) {
    const { evidence } = fixture;

    it(`${evidence.position_id}: no hallucinated moves`, async () => {
      const result = await analyzeBestMoveIntent(evidence, API_KEY);
      const fullText = [result.immediate_goal, result.strategic_purpose, result.why_better_than_played].join(" ");
      expect(noHallucinatedMoves(fullText, evidence)).toBe(true);
    });

    it(`${evidence.position_id}: immediate_goal names best_move`, async () => {
      const result = await analyzeBestMoveIntent(evidence, API_KEY);
      const cleanBest = evidence.best_move.replace(/[+#]/, "");
      expect(result.immediate_goal).toContain(cleanBest);
    });

    it(`${evidence.position_id}: why_better_than_played names player_move`, async () => {
      const result = await analyzeBestMoveIntent(evidence, API_KEY);
      const cleanPlayed = evidence.player_move.replace(/[+#]/, "");
      expect(result.why_better_than_played).toContain(cleanPlayed);
    });
  }
});

describe("played-move-failure eval", () => {
  for (const fixture of FIXTURES) {
    const { evidence } = fixture;

    it(`${evidence.position_id}: no hallucinated moves`, async () => {
      const result = await analyzePlayedMoveFailure(evidence, API_KEY);
      const fullText = [result.what_was_missed, result.concrete_consequence, result.root_cause].join(" ");
      expect(noHallucinatedMoves(fullText, evidence)).toBe(true);
    });

    it(`${evidence.position_id}: what_was_missed names player_move`, async () => {
      const result = await analyzePlayedMoveFailure(evidence, API_KEY);
      const cleanPlayed = evidence.player_move.replace(/[+#]/, "");
      expect(result.what_was_missed).toContain(cleanPlayed);
    });
  }
});
