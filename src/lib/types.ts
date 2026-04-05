// ─── Layer 0: Raw data ────────────────────────────────────────────────────────

export interface RawGame {
  id: string;
  pgn: string;
  opening: { eco: string; name: string };
  winner?: "white" | "black" | "draw";
  playerColor: "white" | "black";
}

export interface PositionEval {
  fen: string;
  player_move: string;
  cp_before: number;
  cp_after: number;
  cp_loss: number;
  best_move: string;
  top_moves: string[];         // top 3 engine candidates
  pv_best: string[];           // 3-move principal variation for best move
  pv_played: string[];         // 3-move PV for played move
  tactical_flags: string[];    // ["mate_threat", "forcing_check", "material_gain"]
  structural_flags: string[];  // ["king_exposed"]
  played_move_rank: number;    // where player's move ranks among engine candidates (1-indexed, 0 = not in top 3)
  depth: number;
  game_id: string;
  move_number: number;
}

export interface OpeningStats {
  eco: string;
  name: string;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;             // (wins + 0.5*draws) / games_played
  avg_cp_loss: number;
  total_cp_loss: number;
  positions: PositionEval[];    // all positions in games with this opening
  blunders: PositionEval[];     // positions with cp_loss >= 150
  performance: "strong" | "average" | "needs_work";
}

// ─── RAG ─────────────────────────────────────────────────────────────────────

export interface CriticalJunction {
  move_number: number;
  fen: string;
  description: string;
  correct_responses: string[];      // SAN moves that stay in theory
  common_mistakes: string[];        // SAN moves club players often play wrong
  mistake_explanation: string;      // 1 sentence: why the wrong move fails
  lichess_stats?: {
    top_moves: Array<{ move: string; games: number; white_wins: number; draws: number; black_wins: number }>;
    total_games: number;
  };
}

export interface OpeningTheory {
  eco: string;
  eco_family: string;
  opening_name: string;
  main_ideas: string[];
  typical_plans: string[];
  common_mistakes: string[];
  key_thematic_moves: string[];
  positional_themes: string[];
  theory_summary: string;
  // v2 fields — optional for backward compat with rows seeded before migration
  critical_junctions?: CriticalJunction[];
  transition_move?: number;         // move number where opening ends
  resulting_structure?: string;     // e.g. "isolated d-pawn in open position"
  structure_demands?: string[];     // 2-4 bullets: what this structure requires
  theory_move_sequence?: string[];  // main-line moves in SAN order
  seeded_at?: string;               // ISO timestamp
}

export type OpeningDiffResult =
  | { status: "followed_theory"; last_theory_move: number }
  | { status: "deviated_at_junction"; junction: CriticalJunction; played_move: string; move_number: number }
  | { status: "correct_moves_wrong_plan"; transition_move: number; resulting_structure: string }
  | { status: "no_theory_available" };

export interface OpeningDiagnosis {
  eco: string;
  opening_name: string;
  diff_result: OpeningDiffResult;
  diagnosis: string;                // 1-sentence: what the player misunderstands
  evidence_positions: Array<{
    fen: string;
    move_number: number;
    player_move: string;
    correct_move: string;
    explanation: string;
  }>;
}

// ─── Layer 1: Evidence & agent outputs ───────────────────────────────────────

export interface EvidencePacket {
  position_id: string;           // "{game_id}_move{move_number}"
  game_id: string;
  opening_eco: string;
  fen: string;
  phase: "opening" | "middlegame" | "endgame";
  player_move: string;
  best_move: string;
  top_moves: string[];
  eval_before_cp: number;
  eval_after_player_cp: number;
  cp_loss: number;
  pv_best_short: string[];
  pv_played_short: string[];
  best_move_gap_cp: number;
  tactical_flags: string[];
  structural_flags: string[];
  played_move_rank: number;
}

export type CoachMode = "tactical" | "positional" | "endgame" | "opening";
export type Severity = "low" | "medium" | "high" | "blunder";
export type CoachConfidence = "green" | "yellow" | "red";

export interface MistakeClassification {
  primary_category: CoachMode;
  mistake_type: string;
  severity: Severity;
  teaching_theme: string;
}

export interface BestMoveIntent {
  immediate_goal: string;
  strategic_purpose: string;
  why_better_than_played: string;
}

export interface PlayedMoveFailure {
  what_was_missed: string;
  concrete_consequence: string;
  root_cause: string;
}

export interface CoachExplanation {
  explanation: string;
  key_lesson: string;
  heuristic: string;
}

export interface ClaimVerdict {
  claim: string;
  verdict: "supported" | "unsupported" | "contradicted";
  evidence_refs: string[];
  supported_by_theory?: boolean;
  contradicts_theory?: boolean;
}

export interface FaithfulnessCritique {
  claims: ClaimVerdict[];
  overall_verdict: "pass" | "partial" | "fail";
  needs_revision: boolean;
  revision_guidance: string;
}

// ─── Layer 2: Cards & plan ────────────────────────────────────────────────────

export interface LessonCard {
  position_id: string;
  game_id: string;
  opening_eco: string;
  category: CoachMode;
  mistake_type: string;
  severity: Severity;
  cp_loss: number;
  teaching_theme: string;
  coach_confidence: CoachConfidence;
  verified_takeaway: string;
  explanation: string;
  key_lesson: string;
  heuristic: string;
  fen: string;
  player_move: string;
  best_move: string;
  tactical_flags: string[];
  structural_flags: string[];
}

export interface PatternAggregation {
  total_positions: number;
  category_distribution: Record<string, number>;
  top_mistake_types: Array<{ type: string; count: number }>;
  top_teaching_themes: Array<{ theme: string; count: number }>;
  top_flags: Array<{ flag: string; count: number }>;
  avg_cp_loss: number;
  confidence_distribution: { green: number; yellow: number; red: number };
}

export interface ImprovementPlan {
  top_weaknesses: string[];
  reliable_areas: string[];
  low_trust_areas: string[];
  study_plan: string;
}

// ─── NDJSON stream events ─────────────────────────────────────────────────────

export type StreamEvent =
  | { type: "progress"; message: string }
  | { type: "openings"; openings: OpeningStats[] }
  | { type: "position"; card: LessonCard }
  | { type: "opening_diagnosis"; diagnosis: OpeningDiagnosis }
  | { type: "plan"; plan: ImprovementPlan }
  | { type: "done" }
  | { type: "error"; message: string };
