import type { PositionEval, EvidencePacket } from "../types";

/**
 * Convert a raw PositionEval from Stockfish into an EvidencePacket.
 * All Claude agents receive EvidencePackets — never raw UCI output.
 */
export function buildEvidence(
  eval_: PositionEval,
  gameId: string,
  openingEco: string
): EvidencePacket {
  const moveNumber = eval_.move_number;
  const positionId = `${gameId}_move${moveNumber}`;

  // Classify game phase by move number
  let phase: "opening" | "middlegame" | "endgame";
  if (moveNumber <= 12) {
    phase = "opening";
  } else if (moveNumber <= 30) {
    phase = "middlegame";
  } else {
    phase = "endgame";
  }

  return {
    position_id: positionId,
    game_id: gameId,
    opening_eco: openingEco,
    fen: eval_.fen,
    phase,
    player_move: eval_.player_move,
    best_move: eval_.best_move,
    top_moves: eval_.top_moves,
    eval_before_cp: eval_.cp_before,
    eval_after_player_cp: eval_.cp_after,
    cp_loss: eval_.cp_loss,
    pv_best_short: eval_.pv_best.slice(0, 3),
    pv_played_short: eval_.pv_played.slice(0, 3),
    best_move_gap_cp: Math.max(0, eval_.cp_before - eval_.cp_after),
    tactical_flags: eval_.tactical_flags,
    structural_flags: eval_.structural_flags,
    played_move_rank: eval_.played_move_rank,
  };
}
