import { replayPGN } from "../../../lib/layer0/opening-aggregator";
import { analyzePosition } from "../../../lib/layer0/stockfish-analyzer";
import { getCachedEval, storeCachedEval, getCachedAnalysis, storeCachedAnalysis, getOpeningTheory, getGamesByOpening } from "../../../lib/db/supabase";
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
import { diffAllGames } from "../../../lib/rag/opening-diff";
import { seedOpeningV2 } from "../../../lib/rag/theory-seeder";
import { buildOpeningDiagnosis } from "../../../lib/layer2/opening-diagnosis-builder";
import type { PositionEval, LessonCard, StreamEvent, OpeningTheory } from "../../../lib/types";


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
        console.log(`[coach] Loading theory for ${eco}`);
        let theory: OpeningTheory | null = await getOpeningTheory(eco);

        // On-demand v2 seeding: trigger if theory exists but has no critical_junctions
        if (theory && !theory.critical_junctions) {
          send({ type: "progress", message: "Enriching opening theory with Lichess data (first time for this opening)..." });
          try {
            await seedOpeningV2(eco, openingName);
            theory = await getOpeningTheory(eco);
            console.log(`[coach][seeder] v2 seeding complete for ${eco}`);
          } catch (err) {
            console.warn(`[coach][seeder] v2 seeding failed for ${eco}:`, err);
            // Non-fatal — continue with v1 theory
          }
        }

        const theoryContext = theory ? buildTheoryContext(theory) : undefined;
        console.log(`[coach][db] Theory ${theory ? (theory.critical_junctions ? "v2" : "v1") : "not found"} for ${eco}`);

        console.log(`[coach][db] Loading games for ${username} / ${eco} from Supabase`);
        send({ type: "progress", message: "Loading games from database..." });

        const openingGames = await getGamesByOpening(username, eco);
        if (openingGames.length === 0) {
          send({ type: "error", message: `No games found for ${eco} in database — run analysis first` });
          return;
        }

        console.log(`[coach][db] Loaded ${openingGames.length} games for ${eco}`);

        // Opening diff — pure move comparison, no Stockfish needed
        const diffResults = theory ? diffAllGames(openingGames, theory) : new Map<string, import("../../../lib/types").OpeningDiffResult>();
        const junctionDeviations = [...diffResults.values()].filter((r) => r.status === "deviated_at_junction").length;
        if (diffResults.size > 0) {
          send({ type: "progress", message: `Opening diff: ${junctionDeviations} junction deviation(s) across ${diffResults.size} game(s)` });
        }

        send({ type: "progress", message: `Running Stockfish on ${openingGames.length} game(s)...` });

        const blunderPositions: Array<{ eval_: PositionEval; gameId: string }> = [];

        for (const game of openingGames) {
          console.log(`[coach][stockfish] Game ${game.id}: pgn length=${game.pgn.length}, color=${game.playerColor}, pgn start="${game.pgn.slice(0, 80)}"`);
          const playerPositions = replayPGN(game.pgn, game.id, game.playerColor);
          console.log(`[coach][stockfish] Game ${game.id}: ${playerPositions.length} positions`);
          for (const { fen, move, moveNumber } of playerPositions) {
            const cached = await getCachedEval(fen);
            if (cached) {
              console.log(`[coach][db] CACHE HIT  ${fen.slice(0, 40)}`);
              if (cached.cp_loss >= 150) blunderPositions.push({ eval_: { ...cached, game_id: game.id, move_number: moveNumber }, gameId: game.id });
            } else {
              console.log(`[coach][db] CACHE MISS ${fen.slice(0, 40)} — running Stockfish`);
              const result = await analyzePosition(fen, move, game.id, moveNumber);
              if (result) {
                storeCachedEval(fen, result).catch(() => {});
                if (result.cp_loss >= 150) blunderPositions.push({ eval_: result, gameId: game.id });
              }
            }
          }
        }

        if (blunderPositions.length === 0) {
          send({ type: "progress", message: "No significant mistakes found in this opening." });
          send({ type: "done" });
          return;
        }

        blunderPositions.sort((a, b) => b.eval_.cp_loss - a.eval_.cp_loss);
        console.log(`[coach] ${blunderPositions.length} blunders (≥150cp) to analyze`);
        send({ type: "progress", message: `Found ${blunderPositions.length} significant mistake(s). Running AI analysis...` });

        const lessonCards: LessonCard[] = [];

        for (const { eval_, gameId } of blunderPositions) {
          const evidence = buildEvidence(eval_, gameId, eco);
          const positionId = evidence.position_id;

          console.log(`[coach][db] Checking cache for ${positionId}`);
          const cached = await getCachedAnalysis(positionId, username);
          if (cached) {
            console.log(`[coach][db] CACHE HIT  ${positionId}`);
            lessonCards.push(cached);
            send({ type: "position", card: cached });
            continue;
          }
          console.log(`[coach][db] CACHE MISS ${positionId} — running agents`);

          send({ type: "progress", message: `Analyzing mistake ${lessonCards.length + 1} of ${blunderPositions.length} (-${eval_.cp_loss}cp)...` });

          try {
            console.log(`[coach][agent] classifier + intent + failure in parallel for ${positionId}`);
            const [classification, intent, failure] = await Promise.all([
              classifyMistake(evidence, apiKey),
              analyzeBestMoveIntent(evidence, apiKey),
              analyzePlayedMoveFailure(evidence, apiKey),
            ]);
            console.log(`[coach][agent] classifier → ${classification.mistake_type} (${classification.severity})`);

            const mode = classification.primary_category;

            console.log(`[coach][agent] coach generating explanation (mode: ${mode})`);
            const initialExplanation = await runCoach(evidence, classification, intent, failure, mode, apiKey, theoryContext);

            console.log(`[coach][agent] critic verifying explanation`);
            const { explanation, confidence, critique: critiqueResult } = await critique(
              evidence, initialExplanation, classification, intent, failure, mode, apiKey, theoryContext
            );
            console.log(`[coach][agent] critic → ${critiqueResult.overall_verdict}, confidence: ${confidence}`);

            const card = buildLessonCard(evidence, classification, explanation, critiqueResult, confidence);

            console.log(`[coach][db] Storing lesson card for ${positionId}`);
            storeCachedAnalysis(positionId, username, card, { classification, intent, failure, critique: critiqueResult }).catch(() => {});

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

        // Opening diagnosis — structural analysis anchored to theory
        if (theory?.critical_junctions && diffResults.size > 0) {
          try {
            send({ type: "progress", message: "Building opening diagnosis..." });
            const openingPhaseCards = lessonCards.filter((c) => c.category === "opening");
            const diagnosis = await buildOpeningDiagnosis(eco, openingName, theory, diffResults, openingPhaseCards, apiKey);
            send({ type: "opening_diagnosis", diagnosis });
            console.log(`[coach][agent] opening diagnosis: "${diagnosis.diagnosis}"`);
          } catch (err) {
            console.warn(`[coach][agent] opening diagnosis failed:`, err);
          }
        }

        if (lessonCards.length > 0) {
          console.log(`[coach][agent] planner generating improvement plan for ${lessonCards.length} cards`);
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
