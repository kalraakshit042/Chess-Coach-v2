import type { EvidencePacket } from "../../lib/types";

/**
 * Five fixture positions with known ground truth for eval testing.
 * All are real-pattern positions — not actual game IDs.
 */
export const FIXTURES: Array<{
  evidence: EvidencePacket;
  ground_truth: {
    expected_category: string;
    expected_severity: string;
    is_tactical: boolean;
    explanation_must_name: string[];    // moves that MUST appear in explanation
    explanation_must_not_invent: string[]; // moves that would be hallucinations
  };
}> = [
  {
    // Fixture 1: Blunder — missed back-rank mate threat
    evidence: {
      position_id: "fixture_game1_move22",
      game_id: "fixture_game1",
      opening_eco: "B90",
      fen: "r4rk1/pp2qppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQR1K1 w - - 0 12",
      phase: "middlegame",
      player_move: "Nd2",
      best_move: "Qd2",
      top_moves: ["Qd2", "Be3", "Nd2"],
      eval_before_cp: 120,
      eval_after_player_cp: -90,
      cp_loss: 210,
      pv_best_short: ["Qd2", "Nxe4", "Nxe4"],
      pv_played_short: ["Nd2", "Nxe4", "Nxd4"],
      best_move_gap_cp: 210,
      tactical_flags: [],
      structural_flags: [],
      played_move_rank: 3,
    },
    ground_truth: {
      expected_category: "positional",
      expected_severity: "high",
      is_tactical: false,
      explanation_must_name: ["Nd2", "Qd2"],
      explanation_must_not_invent: ["Bxf7", "Rxe5", "Ne4"],
    },
  },
  {
    // Fixture 2: Tactical blunder — missed fork
    evidence: {
      position_id: "fixture_game2_move18",
      game_id: "fixture_game2",
      opening_eco: "C65",
      fen: "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b - - 4 8",
      phase: "opening",
      player_move: "Bd6",
      best_move: "Nd4",
      top_moves: ["Nd4", "Bxf2+", "Bd6"],
      eval_before_cp: 80,
      eval_after_player_cp: -180,
      cp_loss: 260,
      pv_best_short: ["Nd4", "Nxd4", "Bxd4"],
      pv_played_short: ["Bd6", "d4", "Bb4"],
      best_move_gap_cp: 260,
      tactical_flags: ["material_gain"],
      structural_flags: [],
      played_move_rank: 3,
    },
    ground_truth: {
      expected_category: "tactical",
      expected_severity: "high",
      is_tactical: true,
      explanation_must_name: ["Bd6", "Nd4"],
      explanation_must_not_invent: ["Rxd4", "Qxd4", "Nf5"],
    },
  },
  {
    // Fixture 3: Blunder — walked into forced mate threat
    evidence: {
      position_id: "fixture_game3_move31",
      game_id: "fixture_game3",
      opening_eco: "D30",
      fen: "6k1/pp3ppp/2p5/8/3P4/5PP1/PP4KP/8 b - - 0 28",
      phase: "endgame",
      player_move: "c5",
      best_move: "g6",
      top_moves: ["g6", "h6", "c5"],
      eval_before_cp: -40,
      eval_after_player_cp: -350,
      cp_loss: 310,
      pv_best_short: ["g6", "d5", "Kf8"],
      pv_played_short: ["c5", "dxc5", "bxc5"],
      best_move_gap_cp: 310,
      tactical_flags: [],
      structural_flags: ["king_exposed"],
      played_move_rank: 3,
    },
    ground_truth: {
      expected_category: "endgame",
      expected_severity: "blunder",
      is_tactical: false,
      explanation_must_name: ["c5", "g6"],
      explanation_must_not_invent: ["Ke6", "Kf7", "h5"],
    },
  },
  {
    // Fixture 4: Medium positional mistake — poor pawn structure
    evidence: {
      position_id: "fixture_game4_move14",
      game_id: "fixture_game4",
      opening_eco: "A10",
      fen: "rnbqkb1r/pp2pppp/2p2n2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 0 5",
      phase: "opening",
      player_move: "cxd5",
      best_move: "e4",
      top_moves: ["e4", "Nf3", "cxd5"],
      eval_before_cp: 30,
      eval_after_player_cp: -60,
      cp_loss: 90,
      pv_best_short: ["e4", "dxe4", "Nxe4"],
      pv_played_short: ["cxd5", "cxd5", "Nf6"],
      best_move_gap_cp: 90,
      tactical_flags: [],
      structural_flags: [],
      played_move_rank: 3,
    },
    ground_truth: {
      expected_category: "opening",
      expected_severity: "medium",
      is_tactical: false,
      explanation_must_name: ["cxd5", "e4"],
      explanation_must_not_invent: ["Bg5", "Qb3", "Rb1"],
    },
  },
  {
    // Fixture 5: Forcing check blunder — missed mate in 1 defense
    evidence: {
      position_id: "fixture_game5_move25",
      game_id: "fixture_game5",
      opening_eco: "B20",
      fen: "r2q1rk1/ppp2ppp/2np4/2b1p1B1/2B1P1b1/3P1N2/PPP2PPP/R2QK2R w KQ - 6 9",
      phase: "middlegame",
      player_move: "Ke2",
      best_move: "Qd2",
      top_moves: ["Qd2", "h3", "Ke2"],
      eval_before_cp: -20,
      eval_after_player_cp: -420,
      cp_loss: 400,
      pv_best_short: ["Qd2", "Bxf3", "Qxf3"],
      pv_played_short: ["Ke2", "Bxf3+", "gxf3"],
      best_move_gap_cp: 400,
      tactical_flags: ["forcing_check", "mate_threat"],
      structural_flags: ["king_exposed"],
      played_move_rank: 3,
    },
    ground_truth: {
      expected_category: "tactical",
      expected_severity: "blunder",
      is_tactical: true,
      explanation_must_name: ["Ke2", "Qd2"],
      explanation_must_not_invent: ["Rxe5", "Nxe5", "f4"],
    },
  },
];
