import { fetchGames } from "../../../lib/layer0/game-fetcher";
import { aggregateByOpening } from "../../../lib/layer0/opening-aggregator";
import { storeGames } from "../../../lib/db/supabase";
import type { StreamEvent } from "../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  let username: string;
  let perfType: string | undefined;
  let since: number | undefined;
  try {
    const body = (await req.json()) as { username?: string; perfType?: string; since?: number };
    username = (body.username ?? "").trim();
    if (!username) {
      return new Response(JSON.stringify({ error: "username is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    perfType = body.perfType;
    since = body.since;
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
        } catch {}
      };

      try {
        console.log(`[analyze] Fetching games for ${username} perfType=${perfType} since=${since}`);
        send({ type: "progress", message: "Fetching games from Lichess..." });

        let games;
        try {
          games = await fetchGames(username, { perfType, since });
        } catch (err) {
          send({ type: "error", message: err instanceof Error ? err.message : "Failed to fetch games" });
          controller.close();
          return;
        }

        if (games.length === 0) {
          send({ type: "error", message: "No public games found for this user" });
          controller.close();
          return;
        }

        console.log(`[analyze] Fetched ${games.length} games — storing in Supabase`);
        for (const g of games.slice(0, 3)) {
          console.log(`[analyze][debug] Game ${g.id}: pgn length=${g.pgn.length}, eco=${g.opening.eco}, pgn start="${g.pgn.slice(0, 60)}"`);
        }
        send({ type: "progress", message: `Fetched ${games.length} games — saving to database...` });
        storeGames(username, games, perfType).catch((err) =>
          console.error("[analyze][db] Failed to store games:", err)
        );

        const openings = aggregateByOpening(games);
        console.log(`[analyze] ${openings.length} openings (>1 game) — sending to client`);

        send({ type: "openings", openings });
        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Unexpected error" });
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
