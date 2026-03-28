/**
 * Eval: coach agent quality
 * Run: pnpm test:evals -- coach
 */

import { describe, it, expect } from "vitest";
import { classifyMistake } from "../lib/layer1/mistake-classifier";
import { analyzeBestMoveIntent } from "../lib/layer1/best-move-intent";
import { analyzePlayedMoveFailure } from "../lib/layer1/played-move-failure";
import { runCoach } from "../lib/layer1/coach";
import { FIXTURES } from "./fixtures/positions";
import type { EvidencePacket } from "../lib/types";

const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

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

// Helper: first word must be a verb
const ACTION_VERBS = new Set(["scan", "check", "calculate", "look", "consider", "ask", "verify", "examine", "always", "before", "find", "identify"]);
function startsWithVerb(text: string): boolean {
  const first = text.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return ACTION_VERBS.has(first);
}

describe("coach eval", () => {
  for (const fixture of FIXTURES) {
    const { evidence } = fixture;

    it(`${evidence.position_id}: no hallucinated moves in explanation`, async () => {
      const [classification, intent, failure] = await Promise.all([
        classifyMistake(evidence, API_KEY),
        analyzeBestMoveIntent(evidence, API_KEY),
        analyzePlayedMoveFailure(evidence, API_KEY),
      ]);

      const result = await runCoach(evidence, classification, intent, failure, classification.primary_category, API_KEY);
      const fullText = [result.explanation, result.key_lesson, result.heuristic].join(" ");
      expect(noHallucinatedMoves(fullText, evidence)).toBe(true);
    });

    it(`${evidence.position_id}: key_lesson is ≤ 20 words`, async () => {
      const [classification, intent, failure] = await Promise.all([
        classifyMistake(evidence, API_KEY),
        analyzeBestMoveIntent(evidence, API_KEY),
        analyzePlayedMoveFailure(evidence, API_KEY),
      ]);

      const result = await runCoach(evidence, classification, intent, failure, classification.primary_category, API_KEY);
      const wordCount = result.key_lesson.trim().split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(20);
    });

    it(`${evidence.position_id}: heuristic starts with action verb`, async () => {
      const [classification, intent, failure] = await Promise.all([
        classifyMistake(evidence, API_KEY),
        analyzeBestMoveIntent(evidence, API_KEY),
        analyzePlayedMoveFailure(evidence, API_KEY),
      ]);

      const result = await runCoach(evidence, classification, intent, failure, classification.primary_category, API_KEY);
      expect(startsWithVerb(result.heuristic)).toBe(true);
    });
  }
});
