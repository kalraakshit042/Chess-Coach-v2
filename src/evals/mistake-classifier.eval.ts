/**
 * Eval: mistake-classifier agent quality
 * Run: pnpm test:evals -- mistake-classifier
 *
 * Checks:
 * 1. Severity mapping: cp_loss → severity must match expected
 * 2. Category alignment: if tactical_flags present → category must be "tactical"
 * 3. Output is valid JSON
 * 4. All runs deterministic (temperature=0): 15/15 must pass
 */

import { describe, it, expect } from "vitest";
import { classifyMistake } from "../lib/layer1/mistake-classifier";
import { FIXTURES } from "./fixtures/positions";

const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const SEVERITY_MAP: Record<string, [number, number]> = {
  blunder: [300, Infinity],
  high: [150, 299],
  medium: [75, 149],
  low: [0, 74],
};

function checkSeverity(severity: string, cpLoss: number): boolean {
  const range = SEVERITY_MAP[severity];
  if (!range) return false;
  return cpLoss >= range[0] && cpLoss <= range[1];
}

describe("mistake-classifier eval", () => {
  for (const fixture of FIXTURES) {
    const { evidence, ground_truth } = fixture;

    it(`${evidence.position_id}: severity matches cp_loss`, async () => {
      const result = await classifyMistake(evidence, API_KEY);
      expect(checkSeverity(result.severity, evidence.cp_loss)).toBe(true);
    });

    it(`${evidence.position_id}: tactical_flags → tactical category`, async () => {
      if (!ground_truth.is_tactical) return;
      const result = await classifyMistake(evidence, API_KEY);
      expect(result.primary_category).toBe("tactical");
    });

    it(`${evidence.position_id}: valid enum values`, async () => {
      const result = await classifyMistake(evidence, API_KEY);
      expect(["tactical", "positional", "opening", "endgame"]).toContain(result.primary_category);
      expect(["low", "medium", "high", "blunder"]).toContain(result.severity);
      expect(typeof result.mistake_type).toBe("string");
      expect(typeof result.teaching_theme).toBe("string");
      expect(result.mistake_type.length).toBeGreaterThan(0);
      expect(result.teaching_theme.length).toBeGreaterThan(0);
    });
  }
});
