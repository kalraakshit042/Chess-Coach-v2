import type {
  EvidencePacket,
  MistakeClassification,
  CoachExplanation,
  FaithfulnessCritique,
  CoachConfidence,
  LessonCard,
} from "../types";

/**
 * Deterministic — no LLM calls. Assembles agent outputs into a LessonCard.
 */
export function buildLessonCard(
  evidence: EvidencePacket,
  classification: MistakeClassification,
  explanation: CoachExplanation,
  critiqueSummary: FaithfulnessCritique,
  confidence: CoachConfidence
): LessonCard {
  // Derive a short verified takeaway from the critique result
  const verifiedTakeaway =
    critiqueSummary.overall_verdict === "pass"
      ? explanation.key_lesson
      : critiqueSummary.overall_verdict === "partial"
      ? `${explanation.key_lesson} (partially verified)`
      : "Analysis confidence low — review manually";

  return {
    position_id: evidence.position_id,
    game_id: evidence.game_id,
    opening_eco: evidence.opening_eco,
    category: classification.primary_category,
    mistake_type: classification.mistake_type,
    severity: classification.severity,
    cp_loss: evidence.cp_loss,
    teaching_theme: classification.teaching_theme,
    coach_confidence: confidence,
    verified_takeaway: verifiedTakeaway,
    explanation: explanation.explanation,
    key_lesson: explanation.key_lesson,
    heuristic: explanation.heuristic,
    fen: evidence.fen,
    player_move: evidence.player_move,
    best_move: evidence.best_move,
    tactical_flags: evidence.tactical_flags,
    structural_flags: evidence.structural_flags,
  };
}
