/**
 * Opening diff — compare a player's game moves against opening theory.
 *
 * Pure chess.js move comparison: no Stockfish, no network, O(n) per game.
 * Runs before Stockfish in the coach pipeline to find structural deviations
 * that engine analysis alone would miss (e.g. a 0cp deviation from theory
 * that still represents a fundamental misunderstanding of the opening).
 */

import { Chess } from "chess.js";
import type { RawGame, OpeningTheory, OpeningDiffResult } from "../types";

/**
 * Classify a single game's opening against theory.
 */
export function diffGameAgainstTheory(
  game: RawGame,
  theory: OpeningTheory
): OpeningDiffResult {
  if (!theory.critical_junctions?.length || !theory.theory_move_sequence?.length) {
    return { status: "no_theory_available" };
  }

  // Replay the actual game to get the move list
  const replay = new Chess();
  try {
    replay.loadPgn(game.pgn);
  } catch {
    return { status: "no_theory_available" };
  }
  const history = replay.history({ verbose: true });

  // Walk through the theory move sequence in parallel with actual game
  for (let i = 0; i < theory.theory_move_sequence.length; i++) {
    const theoryMove = theory.theory_move_sequence[i];
    const actualMove = history[i]?.san;

    if (!actualMove) break; // game ended before theory ran out

    // Only check moves made by this player
    const isPlayerTurn =
      (game.playerColor === "white" && i % 2 === 0) ||
      (game.playerColor === "black" && i % 2 === 1);

    if (!isPlayerTurn) continue;

    const moveNumber = Math.floor(i / 2) + 1;
    const normalize = (m: string) => m.replace(/[+#!?]/g, "");
    const actualNorm = normalize(actualMove);
    const theoryNorm = normalize(theoryMove);

    if (actualNorm !== theoryNorm) {
      // Check if a registered junction covers this move number
      const junction = theory.critical_junctions.find(
        (j) => j.move_number === moveNumber
      );

      if (junction) {
        const isCorrect = junction.correct_responses.some(
          (r) => normalize(r) === actualNorm
        );
        if (!isCorrect) {
          return {
            status: "deviated_at_junction",
            junction,
            played_move: actualMove,
            move_number: moveNumber,
          };
        }
      }
      // Deviation outside a registered junction — not necessarily wrong,
      // keep walking to see if a later junction is hit
    }
  }

  // Player made it through all theory moves without a junction violation
  return {
    status: "correct_moves_wrong_plan",
    transition_move: theory.transition_move ?? 12,
    resulting_structure: theory.resulting_structure ?? "",
  };
}

/**
 * Run the diff across all games in an opening.
 * Returns a Map from game_id → OpeningDiffResult.
 */
export function diffAllGames(
  games: RawGame[],
  theory: OpeningTheory
): Map<string, OpeningDiffResult> {
  const results = new Map<string, OpeningDiffResult>();
  for (const game of games) {
    results.set(game.id, diffGameAgainstTheory(game, theory));
  }
  return results;
}
