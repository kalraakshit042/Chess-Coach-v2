import type { LessonCard, PatternAggregation } from "../types";

/**
 * Deterministic — no LLM calls. Counts recurring patterns across LessonCards.
 */
export function aggregatePatterns(cards: LessonCard[]): PatternAggregation {
  const categoryCounts: Record<string, number> = {};
  const mistakeTypeCounts: Record<string, number> = {};
  const themeCounts: Record<string, number> = {};
  const flagCounts: Record<string, number> = {};

  let greenCount = 0;
  let yellowCount = 0;
  let redCount = 0;

  for (const card of cards) {
    // Category distribution
    categoryCounts[card.category] = (categoryCounts[card.category] ?? 0) + 1;

    // Mistake type frequency
    mistakeTypeCounts[card.mistake_type] =
      (mistakeTypeCounts[card.mistake_type] ?? 0) + 1;

    // Teaching theme frequency
    themeCounts[card.teaching_theme] =
      (themeCounts[card.teaching_theme] ?? 0) + 1;

    // Tactical/structural flag frequency
    for (const flag of [...card.tactical_flags, ...card.structural_flags]) {
      flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;
    }

    // Confidence distribution
    if (card.coach_confidence === "green") greenCount++;
    else if (card.coach_confidence === "yellow") yellowCount++;
    else redCount++;
  }

  // Sort by frequency, take top entries
  const topMistakeTypes = Object.entries(mistakeTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  const topThemes = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([theme, count]) => ({ theme, count }));

  const topFlags = Object.entries(flagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([flag, count]) => ({ flag, count }));

  const totalCpLoss = cards.reduce((sum, c) => sum + c.cp_loss, 0);
  const avgCpLoss = cards.length > 0 ? Math.round(totalCpLoss / cards.length) : 0;

  return {
    total_positions: cards.length,
    category_distribution: categoryCounts,
    top_mistake_types: topMistakeTypes,
    top_teaching_themes: topThemes,
    top_flags: topFlags,
    avg_cp_loss: avgCpLoss,
    confidence_distribution: { green: greenCount, yellow: yellowCount, red: redCount },
  };
}
