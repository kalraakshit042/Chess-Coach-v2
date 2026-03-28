import { Chess } from "chess.js";
import type { RawGame, PositionEval, OpeningStats } from "../types";

/**
 * Replay a PGN game and return every position the player had to move from.
 * Returns { fen, move, moveNumber } for each player move.
 */
export function replayPGN(
  pgn: string,
  gameId: string,
  playerColor: "white" | "black"
): Array<{ fen: string; move: string; moveNumber: number }> {
  if (!pgn.trim()) return [];

  try {
    const chess = new Chess();
    chess.loadPgn(pgn);

    const history = chess.history({ verbose: true });
    const positions: Array<{ fen: string; move: string; moveNumber: number }> =
      [];

    // Replay from scratch to get FEN before each move
    const replay = new Chess();
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      const isPlayerTurn =
        (playerColor === "white" && i % 2 === 0) ||
        (playerColor === "black" && i % 2 === 1);

      if (isPlayerTurn) {
        positions.push({
          fen: replay.fen(),
          move: h.san,
          moveNumber: Math.floor(i / 2) + 1,
        });
      }
      replay.move(h.san);
    }

    return positions;
  } catch {
    return [];
  }
}

/**
 * Group PositionEval[] by ECO opening and compute per-opening stats.
 * Returns OpeningStats[] sorted by avg_cp_loss descending (worst first).
 */
export function aggregateByOpening(
  games: RawGame[],
  positionsByGameId: Map<string, PositionEval[]>
): OpeningStats[] {
  // Group games by ECO code
  const byEco = new Map<string, { game: RawGame; positions: PositionEval[] }[]>();

  for (const game of games) {
    const eco = game.opening.eco;
    const positions = positionsByGameId.get(game.id) ?? [];

    if (!byEco.has(eco)) byEco.set(eco, []);
    byEco.get(eco)!.push({ game, positions });
  }

  const results: OpeningStats[] = [];

  for (const [eco, entries] of byEco) {
    const allPositions = entries.flatMap((e) => e.positions);
    const blunders = allPositions.filter((p) => p.cp_loss >= 150);

    const totalCpLoss = allPositions.reduce((sum, p) => sum + p.cp_loss, 0);
    const avgCpLoss =
      allPositions.length > 0 ? totalCpLoss / allPositions.length : 0;

    let wins = 0;
    let losses = 0;
    let draws = 0;

    for (const { game } of entries) {
      if (!game.winner || game.winner === "draw") {
        draws++;
      } else if (game.winner === game.playerColor) {
        wins++;
      } else {
        losses++;
      }
    }

    const performance: "strong" | "average" | "weak" =
      avgCpLoss < 50 ? "strong" : avgCpLoss > 100 ? "weak" : "average";

    results.push({
      eco,
      name: entries[0]?.game.opening.name ?? eco,
      games_played: entries.length,
      wins,
      losses,
      draws,
      avg_cp_loss: Math.round(avgCpLoss),
      total_cp_loss: totalCpLoss,
      positions: allPositions,
      blunders,
      performance,
    });
  }

  // Sort worst openings first
  return results.sort((a, b) => b.avg_cp_loss - a.avg_cp_loss);
}
