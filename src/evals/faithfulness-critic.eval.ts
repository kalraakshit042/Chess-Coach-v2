/**
 * Eval: faithfulness-critic agent quality
 * Run: pnpm test:evals -- faithfulness-critic
 *
 * Key eval: hallucination detection rate ≥ 4/5
 */

import { describe, it, expect } from "vitest";
import { classifyMistake } from "../lib/layer1/mistake-classifier";
import { analyzeBestMoveIntent } from "../lib/layer1/best-move-intent";
import { analyzePlayedMoveFailure } from "../lib/layer1/played-move-failure";
import { runCoach } from "../lib/layer1/coach";
import { critique } from "../lib/layer1/faithfulness-critic";
import { FIXTURES } from "./fixtures/positions";

const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

describe("faithfulness-critic eval", () => {
  it("logical consistency: pass verdict implies needs_revision=false", async () => {
    for (const fixture of FIXTURES.slice(0, 2)) {
      const { evidence } = fixture;
      const [classification, intent, failure] = await Promise.all([
        classifyMistake(evidence, API_KEY),
        analyzeBestMoveIntent(evidence, API_KEY),
        analyzePlayedMoveFailure(evidence, API_KEY),
      ]);
      const initialExplanation = await runCoach(evidence, classification, intent, failure, classification.primary_category, API_KEY);
      const { critique: critiqueResult } = await critique(evidence, initialExplanation, classification, intent, failure, classification.primary_category, API_KEY);

      if (critiqueResult.overall_verdict === "pass") {
        expect(critiqueResult.needs_revision).toBe(false);
      }
    }
  });

  it("supported claims must have evidence_refs", async () => {
    for (const fixture of FIXTURES.slice(0, 2)) {
      const { evidence } = fixture;
      const [classification, intent, failure] = await Promise.all([
        classifyMistake(evidence, API_KEY),
        analyzeBestMoveIntent(evidence, API_KEY),
        analyzePlayedMoveFailure(evidence, API_KEY),
      ]);
      const initialExplanation = await runCoach(evidence, classification, intent, failure, classification.primary_category, API_KEY);
      const { critique: critiqueResult } = await critique(evidence, initialExplanation, classification, intent, failure, classification.primary_category, API_KEY);

      for (const claim of critiqueResult.claims) {
        if (claim.verdict === "supported" || claim.verdict === "contradicted") {
          expect(claim.evidence_refs.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("hallucination detection: critic catches injected fake moves ≥ 4/5", async () => {
    let caught = 0;
    const total = FIXTURES.length;

    for (const fixture of FIXTURES) {
      const { evidence } = fixture;
      const [classification, intent, failure] = await Promise.all([
        classifyMistake(evidence, API_KEY),
        analyzeBestMoveIntent(evidence, API_KEY),
        analyzePlayedMoveFailure(evidence, API_KEY),
      ]);

      // Inject a hallucinated move that doesn't exist in the evidence
      const tampered = {
        explanation: `The move Rh8 attacks the queen directly and wins material because Rxh8 cannot be stopped.`,
        key_lesson: "Always look for Rh8 attacking ideas.",
        heuristic: "Scan for Rh8 before playing passive moves.",
      };

      const { critique: critiqueResult } = await critique(evidence, tampered, classification, intent, failure, classification.primary_category, API_KEY);

      // Critic should flag at least one claim as unsupported or contradicted
      const flagged = critiqueResult.claims.some(
        (c) => c.verdict === "unsupported" || c.verdict === "contradicted"
      );
      if (flagged) caught++;
    }

    expect(caught).toBeGreaterThanOrEqual(4);
  }, 120_000); // Allow up to 2 min for all 5 fixtures
});
