import { getOpeningTheory } from "../db/supabase";
import type { OpeningTheory } from "../types";

export { getOpeningTheory };

/**
 * Build the theory context string injected into coach + critic prompts.
 * Returns null if no theory found (agents run without RAG context).
 */
export function buildTheoryContext(theory: OpeningTheory): string {
  return `
OPENING THEORY CONTEXT (${theory.opening_name}, ECO ${theory.eco}):
Main ideas: ${theory.main_ideas.join(", ")}
Typical plans: ${theory.typical_plans.join("; ")}
Common mistakes at this level: ${theory.common_mistakes.join("; ")}
Thematic moves: ${theory.key_thematic_moves.join(", ")}
Positional themes: ${theory.positional_themes.join(", ")}

Summary: ${theory.theory_summary}

Use this theory to ground your explanation. If the player's mistake violates a specific
principle above, cite it explicitly by name. If the best move supports a key thematic idea,
connect it to that plan.`.trim();
}
