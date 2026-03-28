import { fetchGames } from "../../../lib/layer0/game-fetcher";
import { replayPGN } from "../../../lib/layer0/opening-aggregator";
import { analyzePosition } from "../../../lib/layer0/stockfish-analyzer";
import { getCachedEval, storeCachedEval, getCachedAnalysis, storeCachedAnalysis, getOpeningTheory } from "../../../lib/db/supabase";
import { buildEvidence } from "../../../lib/layer1/evidence-builder";
import { classifyMistake } from "../../../lib/layer1/mistake-classifier";
import { analyzeBestMoveIntent } from "../../../lib/layer1/best-move-intent";
import { analyzePlayedMoveFailure } from "../../../lib/layer1/played-move-failure";
import { runCoach } from "../../../lib/layer1/coach";
import { critique } from "../../../lib/layer1/faithfulness-critic";
import { buildLessonCard } from "../../../lib/layer2/lesson-card-builder";
import { aggregatePatterns } from "../../../lib/layer2/pattern-aggregator";
import { generateImprovementPlan } from "../../../lib/layer2/improvement-planner";
import { buildTheoryContext } from "../../../lib/rag/theory-fetcher";
import type { PositionEval, LessonCard, StreamEvent } from "../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: Request): Promise<Response> {
  let username: string;
  let eco: string;
  let openingName: string;
  let apiKey: string;

  try {
    const body = (await req.json()) as {
      username?: string;
      eco?: string;
      opening_name?: string;
      apiKey?: string;
    };
    username = (body.username ?? "").trim();
    eco = (body.eco ?? "").trim();
    openingName = (body.opening_name ?? eco).trim();
    apiKey = body.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";

    if (!username || !eco) {
      return new Response(JSON.stringify({ error: "username and eco are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No API key available. Please provide your Anthropic API key." }), {
        status: 401,
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
        // Fetch opening theory for RAG
        const theory = await getOpeningTheory(eco);
        const theoryContext = theory ? buildTheoryContext(theory) : undefined;

        send({ type: "progress", message: `Loading theory for ${openingName}...` });

        // Fetch games and find all that match this ECO
        send({ type: "progress", message: "Fetching games from Lichess..." });
        let games;
        try {
          games = await fetchGames(username, 10);
        } catch (err) {
          send({ type: "error", message: err instanceof Error ? err.message : "Failed to fetch games" });
          controller.close();
          return;
        }

        const openingGames = games.filter((g) => g.opening.eco === eco);

        if (openingGames.length === 0) {
          send({ type: "error", message: `No games found for opening ${eco}` });
          controller.close();
          return;
        }

        send({ type: "progress", message: `Found ${openingGames.length} games in ${openingName}. Analyzing positions...` });

        // Collect all blunder positions from this opening's games
        const blunderPositions: Array<{ eval_: PositionEval; gameId: string }> = [];

        for (const game of openingGames) {
          const playerPositions = replayPGN(game.pgn, game.id, game.playerColor);

          for (const { fen, move, moveNumber } of playerPositions) {
            let result = await getCachedEval(fen);
            if (!result) {
              result = await analyzePosition(fen, move, game.id, moveNumber);
              if (result) storeCachedEval(fen, result).catch(() => {});
            }
            if (result && result.cp_loss >= 150) {
              blunderPositions.push({ eval_: { ...result, game_id: game.id, move_number: moveNumber }, gameId: game.id });
            }
          }
        }

        if (blunderPositions.length === 0) {
          send({ type: "progress", message: "No significant mistakes found in this opening (all moves within 150cp of best)." });
          send({ type: "done" });
          controller.close();
          return;
        }

        // Sort worst first
        blunderPositions.sort((a, b) => b.eval_.cp_loss - a.eval_.cp_loss);

        send({ type: "progress", message: `Found ${blunderPositions.length} significant mistakes. Running coaching pipeline...` });

        const lessonCards: LessonCard[] = [];

        for (const { eval_, gameId } of blunderPositions) {
          const evidence = buildEvidence(eval_, gameId, eco);
          const positionId = evidence.position_id;

          // Check cache first
          const cached = await getCachedAnalysis(positionId, username);
          if (cached) {
            lessonCards.push(cached);
            send({ type: "position", card: cached });
            continue;
          }

          send({ type: "progress", message: `Analyzing position ${positionId}...` });

          try {
            // Run 5 micro-agents
            const [classification, intent, failure] = await Promise.all([
              classifyMistake(evidence, apiKey),
              analyzeBestMoveIntent(evidence, apiKey),
              analyzePlayedMoveFailure(evidence, apiKey),
            ]);

            const mode = classification.primary_category;

            const initialExplanation = await runCoach(
              evidence,
              classification,
              intent,
              failure,
              mode,
              apiKey,
              theoryContext
            );

            const { explanation, confidence, critique: critiqueResult } = await critique(
              evidence,
              initialExplanation,
              classification,
              intent,
              failure,
              mode,
              apiKey,
              theoryContext
            );

            const card = buildLessonCard(evidence, classification, explanation, critiqueResult, confidence);

            // Cache and stream
            storeCachedAnalysis(positionId, username, card, {
              classification,
              intent,
              failure,
              critique: critiqueResult,
            }).catch(() => {});

            lessonCards.push(card);
            send({ type: "position", card });
          } catch (err) {
            // Don't fail the entire stream for one position
            console.error(`[coach] Failed position ${positionId}:`, err);
            send({
              type: "progress",
              message: `Skipped position ${positionId} (analysis error)`,
            });
          }
        }

        if (lessonCards.length > 0) {
          send({ type: "progress", message: "Generating improvement plan..." });
          const patterns = aggregatePatterns(lessonCards);
          const plan = await generateImprovementPlan(lessonCards, patterns, openingName, apiKey);
          send({ type: "plan", plan });
        }

        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Unexpected error in coaching pipeline",
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
