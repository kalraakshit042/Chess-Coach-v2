import type { RawGame } from "../types";

const LICHESS_API_BASE = "https://lichess.org/api";
const FETCH_TIMEOUT_MS = 30_000;

export async function fetchGames(
  username: string,
  options?: { perfType?: string; since?: number }
): Promise<RawGame[]> {
  const params = new URLSearchParams({
    opening: "true",
    pgnInJson: "true",
  });
  if (options?.perfType) params.set("perfType", options.perfType);
  if (options?.since) params.set("since", String(options.since));

  const url = `${LICHESS_API_BASE}/games/user/${encodeURIComponent(username)}?${params}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/x-ndjson" },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Lichess API request timed out after 15 seconds");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 404) {
    throw new Error("User not found on Lichess");
  }
  if (response.status === 429) {
    throw new Error("Lichess rate limit hit — wait 60 seconds and retry");
  }
  if (!response.ok) {
    throw new Error(`Lichess API error: ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  const games: RawGame[] = [];

  for (const line of lines) {
    let game: Record<string, unknown>;
    try {
      game = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // skip malformed lines
      continue;
    }

    const players = game.players as
      | { white?: { user?: { name?: string } }; black?: { user?: { name?: string } } }
      | undefined;

    const whiteUsername = players?.white?.user?.name ?? "";
    const playerColor: "white" | "black" =
      whiteUsername.toLowerCase() === username.toLowerCase() ? "white" : "black";

    const rawWinner = game.winner as string | undefined;
    let winner: "white" | "black" | "draw" | undefined;
    if (rawWinner === "white" || rawWinner === "black") {
      winner = rawWinner;
    } else if (rawWinner === undefined || rawWinner === null) {
      // No winner field means draw in Lichess API
      winner = "draw";
    }

    const opening = game.opening as { eco?: string; name?: string } | undefined;

    games.push({
      id: String(game.id ?? ""),
      pgn: String(game.pgn ?? ""),
      opening: {
        eco: opening?.eco ?? "A00",
        name: opening?.name ?? "Unknown Opening",
      },
      winner,
      playerColor,
    });
  }

  return games;
}
