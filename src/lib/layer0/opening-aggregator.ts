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
 * Group games by ECO opening and compute per-opening stats (win/loss/draw only).
 * No Stockfish data — returns immediately after game fetch.
 */
export function aggregateByOpening(games: RawGame[]): OpeningStats[] {
  const byEco = new Map<string, RawGame[]>();

  for (const game of games) {
    const eco = game.opening.eco;
    if (!byEco.has(eco)) byEco.set(eco, []);
    byEco.get(eco)!.push(game);
  }

  const results: OpeningStats[] = [];

  for (const [eco, entries] of byEco) {
    let wins = 0, losses = 0, draws = 0;

    for (const game of entries) {
      if (!game.winner || game.winner === "draw") draws++;
      else if (game.winner === game.playerColor) wins++;
      else losses++;
    }

    const gamesPlayed = entries.length;
    const winRate = gamesPlayed > 0 ? (wins + 0.5 * draws) / gamesPlayed : 0;

    results.push({
      eco,
      name: entries[0]?.opening.name ?? eco,
      games_played: gamesPlayed,
      wins,
      losses,
      draws,
      win_rate: winRate,
      avg_cp_loss: 0,
      total_cp_loss: 0,
      positions: [],
      blunders: [],
      performance: "average", // placeholder — overwritten by categorizeByWinRate
    });
  }

  return categorizeByWinRate(results.filter((o) => o.games_played > 1));
}

/**
 * Split openings into thirds by win rate (relative ranking).
 * Top third → strong, middle → average, bottom → needs_work.
 */
export function categorizeByWinRate(openings: OpeningStats[]): OpeningStats[] {
  if (openings.length === 0) return openings;

  const sorted = [...openings].sort(
    (a, b) => b.win_rate - a.win_rate || b.games_played - a.games_played
  );

  const n = sorted.length;
  const strongEnd = Math.ceil(n / 3);
  const avgEnd = strongEnd + Math.ceil((n - strongEnd) / 2);

  return sorted.map((o, i) => ({
    ...o,
    performance:
      i < strongEnd ? "strong" : i < avgEnd ? "average" : "needs_work",
  }));
}

/**
 * Enrich already-aggregated openings with Stockfish eval data.
 * Call this after background analysis completes.
 */
export function enrichWithEvals(
  openings: OpeningStats[],
  positionsByGameId: Map<string, PositionEval[]>,
  games: RawGame[]
): OpeningStats[] {
  // Build eco → positions map
  const positionsByEco = new Map<string, PositionEval[]>();

  for (const game of games) {
    const positions = positionsByGameId.get(game.id) ?? [];
    const existing = positionsByEco.get(game.opening.eco) ?? [];
    positionsByEco.set(game.opening.eco, [...existing, ...positions]);
  }

  return openings.map((o) => {
    const allPositions = positionsByEco.get(o.eco) ?? [];
    const blunders = allPositions.filter((p) => p.cp_loss >= 150);
    const totalCpLoss = allPositions.reduce((sum, p) => sum + p.cp_loss, 0);
    const avgCpLoss =
      allPositions.length > 0 ? Math.round(totalCpLoss / allPositions.length) : 0;

    return {
      ...o,
      positions: allPositions,
      blunders,
      avg_cp_loss: avgCpLoss,
      total_cp_loss: totalCpLoss,
    };
  });
}
