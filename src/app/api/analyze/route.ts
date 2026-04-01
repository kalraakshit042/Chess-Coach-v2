import { fetchGames } from "../../../lib/layer0/game-fetcher";
import { replayPGN, aggregateByOpening } from "../../../lib/layer0/opening-aggregator";
import { analyzePosition } from "../../../lib/layer0/stockfish-analyzer";
import { getCachedEval, storeCachedEval } from "../../../lib/db/supabase";
import type { PositionEval, StreamEvent } from "../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — Railway has no hard limit

export async function POST(req: Request): Promise<Response> {
  let username: string;
  try {
    const body = (await req.json()) as { username?: string };
    username = (body.username ?? "").trim();
    if (!username) {
      return new Response(JSON.stringify({ error: "username is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // Stream may be closed
        }
      };

      try {
        send({ type: "progress", message: "Fetching games from Lichess..." });

        let games;
        try {
          games = await fetchGames(username, 10);
        } catch (err) {
          send({
            type: "error",
            message: err instanceof Error ? err.message : "Failed to fetch games",
          });
          controller.close();
          return;
        }

        if (games.length === 0) {
          send({ type: "error", message: "No public games found for this user" });
          controller.close();
          return;
        }

        send({ type: "progress", message: `Found ${games.length} games. Running Stockfish analysis...` });

        // Map from gameId → PositionEval[]
        const positionsByGameId = new Map<string, PositionEval[]>();

        for (const game of games) {
          const playerPositions = replayPGN(game.pgn, game.id, game.playerColor);
          const evals: PositionEval[] = [];

          send({
            type: "progress",
            message: `Analyzing ${game.opening.name} (${playerPositions.length} positions)...`,
          });

          for (const { fen, move, moveNumber } of playerPositions) {
            // Check Supabase cache first
            const cached = await getCachedEval(fen);
            if (cached) {
              evals.push({ ...cached, game_id: game.id, move_number: moveNumber });
              continue;
            }

            // Run Stockfish
            const result = await analyzePosition(fen, move, game.id, moveNumber);
            if (result) {
              evals.push(result);
              // Store in cache (non-blocking — error won't stop analysis)
              storeCachedEval(fen, result).catch(() => {});
            }
          }

          positionsByGameId.set(game.id, evals);
        }

        send({ type: "progress", message: "Aggregating opening statistics..." });

        const openings = aggregateByOpening(games, positionsByGameId);

        send({ type: "openings", openings });
        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Unexpected error during analysis",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
