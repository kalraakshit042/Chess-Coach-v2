import { spawn } from "child_process";
import type { PositionEval } from "../types.js";
import { Chess } from "chess.js";

const DEFAULT_DEPTH = 18;
const ANALYSIS_TIMEOUT_MS = 15_000;

interface MultiPVEntry {
  multipv: number;
  depth: number;
  cp: number;
  mate: number | null;
  pv: string[];
}

function parseInfoLine(line: string): MultiPVEntry | null {
  if (!line.startsWith("info") || !line.includes("multipv")) return null;
  const depthMatch = line.match(/\bdepth (\d+)/);
  const multipvMatch = line.match(/\bmultipv (\d+)/);
  const cpMatch = line.match(/\bscore cp (-?\d+)/);
  const mateMatch = line.match(/\bscore mate (-?\d+)/);
  const pvMatch = line.match(/\bpv (.+)$/);
  if (!multipvMatch) return null;
  return {
    multipv: parseInt(multipvMatch[1], 10),
    depth: depthMatch ? parseInt(depthMatch[1], 10) : 0,
    cp: cpMatch ? parseInt(cpMatch[1], 10) : 0,
    mate: mateMatch ? parseInt(mateMatch[1], 10) : null,
    pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : [],
  };
}

function detectTacticalFlags(pvBest: string[], hasMate: boolean): string[] {
  const flags: string[] = [];
  if (hasMate) flags.push("mate_threat");
  if (pvBest.length > 0 && pvBest[0].endsWith("+")) flags.push("forcing_check");
  const capturePattern = /[NBRQK]x[a-h][1-8]|[a-h]x[a-h][1-8]/;
  if (pvBest.some((m) => capturePattern.test(m))) flags.push("material_gain");
  return flags;
}

function detectStructuralFlags(fen: string): string[] {
  const flags: string[] = [];
  try {
    const chess = new Chess(fen);
    const board = chess.board();
    const turn = chess.turn();
    let kingRow = -1, kingCol = -1;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = board[r][c];
        if (sq && sq.type === "k" && sq.color === turn) { kingRow = r; kingCol = c; }
      }
    }
    if (kingRow !== -1) {
      const shieldRow = turn === "w" ? kingRow - 1 : kingRow + 1;
      if (shieldRow >= 0 && shieldRow < 8) {
        let shields = 0;
        for (let dc = -1; dc <= 1; dc++) {
          const sc = kingCol + dc;
          if (sc >= 0 && sc < 8) {
            const sq = board[shieldRow][sc];
            if (sq && sq.type === "p" && sq.color === turn) shields++;
          }
        }
        if (shields === 0) flags.push("king_exposed");
      }
    }
  } catch { /* skip */ }
  return flags;
}

async function runEngineAnalysis(
  fen: string,
  depth: number
): Promise<{ entries: MultiPVEntry[]; reachedDepth: number; hasMate: boolean }> {
  return new Promise((resolve, reject) => {
    const sf = spawn("stockfish", [], { stdio: "pipe" });
    const entriesByMultipv = new Map<number, MultiPVEntry>();
    let reachedDepth = 0;
    let hasMate = false;
    let settled = false;
    let lineBuffer = "";

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try { sf.kill(); } catch { /* ignore */ }
      resolve({
        entries: Array.from(entriesByMultipv.values()).sort((a, b) => a.multipv - b.multipv),
        reachedDepth,
        hasMate,
      });
    };

    const timeoutId = setTimeout(() => {
      if (!settled) { try { sf.stdin.write("stop\n"); } catch { /* ignore */ } setTimeout(finish, 500); }
    }, ANALYSIS_TIMEOUT_MS);

    sf.stderr.on("data", () => {});
    sf.stdout.on("data", (chunk: Buffer) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (settled) break;
        const trimmed = line.trim();
        if (trimmed.startsWith("info")) {
          const entry = parseInfoLine(trimmed);
          if (entry) {
            const existing = entriesByMultipv.get(entry.multipv);
            if (!existing || entry.depth >= existing.depth) {
              entriesByMultipv.set(entry.multipv, entry);
              if (entry.depth > reachedDepth) reachedDepth = entry.depth;
              if (entry.mate !== null) hasMate = true;
            }
          }
        } else if (trimmed.startsWith("bestmove")) {
          finish();
        }
      }
    });
    sf.on("error", (err) => {
      if (!settled) { settled = true; clearTimeout(timeoutId); reject(new Error(`Stockfish not found: ${err.message}. Install with: brew install stockfish`)); }
    });
    sf.on("close", () => { if (!settled) finish(); });

    sf.stdin.write("uci\n");
    sf.stdin.write("isready\n");
    sf.stdin.write("setoption name MultiPV value 3\n");
    sf.stdin.write(`position fen ${fen}\n`);
    sf.stdin.write(`go depth ${depth}\n`);
  });
}

export async function analyzePosition(
  fen: string,
  playedMove: string,
  gameId: string,
  moveNumber: number,
  depth = DEFAULT_DEPTH
): Promise<PositionEval | null> {
  try {
    const { entries: beforeEntries, reachedDepth, hasMate } = await runEngineAnalysis(fen, depth);
    if (beforeEntries.length === 0) return null;

    const best = beforeEntries[0];
    const cpBeforeRaw = best.mate !== null ? (best.mate > 0 ? 30_000 : -30_000) : best.cp;
    const cpBefore = cpBeforeRaw;

    let cpAfter = cpBefore;
    const pvPlayed: string[] = [];

    try {
      const chessAfter = new Chess(fen);
      const moveResult = chessAfter.move(playedMove);
      if (moveResult) {
        const fenAfter = chessAfter.fen();
        const { entries: afterEntries } = await runEngineAnalysis(fenAfter, Math.min(depth, DEFAULT_DEPTH));
        if (afterEntries.length > 0) {
          const bestAfter = afterEntries[0];
          const cpAfterRaw = bestAfter.mate !== null ? (bestAfter.mate > 0 ? 30_000 : -30_000) : bestAfter.cp;
          cpAfter = -cpAfterRaw;
          pvPlayed.push(...(bestAfter.pv ?? []).slice(0, 3));
        }
      }
    } catch { /* use same eval */ }

    const cpLoss = Math.max(0, cpBefore - cpAfter);
    const topMoves = beforeEntries.slice(0, 3).map((e) => e.pv[0] ?? "").filter(Boolean);
    const pvBest = (beforeEntries[0]?.pv ?? []).slice(0, 3);
    const bestMove = topMoves[0] ?? "";
    const playedRank = topMoves.indexOf(playedMove);
    const playedMoveRank = playedRank === -1 ? 0 : playedRank + 1;

    return {
      fen,
      player_move: playedMove,
      cp_before: cpBefore,
      cp_after: cpAfter,
      cp_loss: cpLoss,
      best_move: bestMove,
      top_moves: topMoves,
      pv_best: pvBest,
      pv_played: pvPlayed,
      tactical_flags: detectTacticalFlags(pvBest, hasMate),
      structural_flags: detectStructuralFlags(fen),
      played_move_rank: playedMoveRank,
      depth: reachedDepth,
      game_id: gameId,
      move_number: moveNumber,
    };
  } catch (err) {
    console.error(`[stockfish-analyzer] error:`, err);
    return null;
  }
}
