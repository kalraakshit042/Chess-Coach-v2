/**
 * Opening theory seeder — v2
 *
 * Builds structured, matchable theory for any ECO code by:
 *   1. Walking the main line via Lichess opening explorer (real move stats)
 *   2. Identifying critical junctions from branching/win-rate data
 *   3. Using Claude to synthesize transition_move, resulting_structure,
 *      structure_demands, and mistake_explanation per junction
 *
 * Usage (one-off):   pnpm seed:theory
 * On-demand:         import { seedOpeningV2 } from "./theory-seeder"
 */

import Anthropic from "@anthropic-ai/sdk";
import { Chess } from "chess.js";
import { upsertOpeningTheory } from "../db/supabase";
import type { CriticalJunction, OpeningTheory } from "../types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const LICHESS_EXPLORER = "https://lichess.org/api/opening-explorer/lichess";

// ─── Lichess opening explorer ─────────────────────────────────────────────────

interface LichessMove {
  uci: string;
  san: string;
  averageRating: number;
  white: number;
  draws: number;
  black: number;
}

interface LichessExplorerResponse {
  moves: LichessMove[];
  white: number;
  draws: number;
  black: number;
}

async function fetchExplorer(fen: string): Promise<LichessExplorerResponse | null> {
  try {
    const url = `${LICHESS_EXPLORER}?variant=standard&fen=${encodeURIComponent(fen)}&speeds=rapid&ratings=1600,1800`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return res.json() as Promise<LichessExplorerResponse>;
  } catch {
    return null;
  }
}

// ─── Main line builder ────────────────────────────────────────────────────────

interface MainLineStep {
  fen: string;
  move: string;           // SAN of the move played to reach next position
  moveNumber: number;
  explorerData: LichessExplorerResponse;
}

async function buildMainLine(
  eco: string,
  maxDepth = 20
): Promise<MainLineStep[]> {
  const chess = new Chess();
  const steps: MainLineStep[] = [];

  for (let i = 0; i < maxDepth * 2; i++) {
    const fen = chess.fen();
    const data = await fetchExplorer(fen);

    if (!data || data.moves.length === 0) break;

    const totalGames = data.moves.reduce((s, m) => s + m.white + m.draws + m.black, 0);
    if (totalGames < 50) break;

    // Top move = most played
    const topMove = data.moves[0];
    const moveNumber = Math.floor(i / 2) + 1;

    steps.push({ fen, move: topMove.san, moveNumber, explorerData: data });

    try {
      chess.move(topMove.san);
    } catch {
      break;
    }
  }

  return steps;
}

// ─── Junction identification ──────────────────────────────────────────────────

function isCriticalJunction(step: MainLineStep): boolean {
  const moves = step.explorerData.moves;
  if (moves.length < 2) return false;

  const total = moves.reduce((s, m) => s + m.white + m.draws + m.black, 0);
  if (total === 0) return false;

  const topGames = moves[0].white + moves[0].draws + moves[0].black;
  const secondGames = moves[1].white + moves[1].draws + moves[1].black;

  // Real branching: second-most-popular move gets >15% of games
  const secondShare = secondGames / total;
  if (secondShare > 0.15) return true;

  // Win-rate trap: a popular move has a significantly worse win rate
  const topWinRate = (moves[0].white + moves[0].draws * 0.5) / topGames;
  for (const m of moves.slice(1, 4)) {
    const games = m.white + m.draws + m.black;
    if (games < 30) continue;
    const winRate = (m.white + m.draws * 0.5) / games;
    // If it's played often but wins much less — it's a common mistake
    const gameShare = games / total;
    if (gameShare > 0.08 && winRate < topWinRate - 0.1) return true;
  }

  return false;
}

function buildJunctionFromStep(step: MainLineStep): Omit<CriticalJunction, "mistake_explanation" | "description"> {
  const moves = step.explorerData.moves;
  const total = moves.reduce((s, m) => s + m.white + m.draws + m.black, 0);

  const topWinRate = (m: LichessMove) =>
    (m.white + m.draws * 0.5) / (m.white + m.draws + m.black || 1);

  // Correct responses: moves with win rate within 8% of best move
  const bestWr = topWinRate(moves[0]);
  const correct = moves
    .filter((m) => topWinRate(m) >= bestWr - 0.08)
    .map((m) => m.san);

  // Common mistakes: popular moves with clearly worse win rates
  const mistakes = moves
    .filter((m) => {
      const games = m.white + m.draws + m.black;
      const share = games / total;
      return share > 0.05 && topWinRate(m) < bestWr - 0.1 && !correct.includes(m.san);
    })
    .map((m) => m.san);

  return {
    move_number: step.moveNumber,
    fen: step.fen,
    correct_responses: correct,
    common_mistakes: mistakes,
    lichess_stats: {
      top_moves: moves.slice(0, 5).map((m) => ({
        move: m.san,
        games: m.white + m.draws + m.black,
        white_wins: m.white,
        draws: m.draws,
        black_wins: m.black,
      })),
      total_games: total,
    },
  };
}

// ─── Claude synthesis ─────────────────────────────────────────────────────────

interface SynthesisOutput {
  transition_move: number;
  resulting_structure: string;
  structure_demands: string[];
  junctions: Array<{ fen: string; description: string; mistake_explanation: string }>;
}

async function synthesizeWithClaude(
  eco: string,
  name: string,
  mainLine: MainLineStep[],
  partialJunctions: Array<Omit<CriticalJunction, "mistake_explanation" | "description">>
): Promise<SynthesisOutput> {
  const moveSequence = mainLine.map((s) => s.move).join(" ");
  const junctionSummaries = partialJunctions.map((j) => ({
    move_number: j.move_number,
    fen: j.fen,
    correct_responses: j.correct_responses,
    common_mistakes: j.common_mistakes,
    lichess_top_moves: j.lichess_stats?.top_moves.slice(0, 3),
  }));

  const prompt = `You are an expert chess coach. I have Lichess opening explorer data for "${name}" (ECO ${eco}).

Main line moves (by popularity at 1600-1800 rapid): ${moveSequence}

Critical junctions identified from Lichess data:
${JSON.stringify(junctionSummaries, null, 2)}

Based on this data, return ONLY valid JSON:
{
  "transition_move": <integer — move number where opening theory ends and middlegame begins>,
  "resulting_structure": "<one short phrase — the pawn/piece structure this opening typically produces, e.g. 'isolated d-pawn with open e-file'>",
  "structure_demands": ["<2-4 short bullets: what this structure concretely requires from the player>"],
  "junctions": [
    {
      "fen": "<exact fen string from input>",
      "description": "<1 sentence: what decision the player faces at this junction>",
      "mistake_explanation": "<1 sentence: why the common wrong moves fail specifically in this opening>"
    }
  ]
}

Rules:
- transition_move: typically 10-16 for most openings
- resulting_structure: specific, not generic (not just "open position")
- structure_demands: actionable, e.g. "use the open b-file for rook pressure" not "be active"
- description: name the opening idea at stake, e.g. "Black must decide whether to accept the gambit pawn or maintain tension"
- mistake_explanation: reference the specific opening idea violated, not generic chess principles
- Include exactly one junction entry per junction in the input (matched by fen)`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  const jsonStr = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(jsonStr) as SynthesisOutput;
}

// ─── V1 theory generation (fallback for non-junction fields) ─────────────────

async function generateV1Theory(
  eco: string,
  name: string
): Promise<Pick<OpeningTheory, "main_ideas" | "typical_plans" | "common_mistakes" | "key_thematic_moves" | "positional_themes" | "theory_summary">> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    temperature: 0,
    messages: [{
      role: "user",
      content: `You are a chess coach. Generate structured opening theory for "${name}" (ECO ${eco}).
Return ONLY valid JSON:
{
  "main_ideas": ["string"],
  "typical_plans": ["string"],
  "common_mistakes": ["string"],
  "key_thematic_moves": ["string"],
  "positional_themes": ["string"],
  "theory_summary": "string"
}
Guidelines:
- main_ideas: 3-5 core strategic concepts
- typical_plans: 3-5 concrete plans each side pursues
- common_mistakes: 3-5 frequent errors at club level
- key_thematic_moves: 4-8 important moves or move patterns
- positional_themes: 3-5 structural/positional concepts
- theory_summary: 2-3 sentence prose overview
Be specific. Club-level focus.`,
    }],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  const jsonStr = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(jsonStr);
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function seedOpeningV2(eco: string, name: string): Promise<void> {
  console.log(`[seeder] Building main line for ${eco} ${name}...`);
  const mainLine = await buildMainLine(eco);
  console.log(`[seeder] ${mainLine.length} steps in main line`);

  const junctionSteps = mainLine.filter(isCriticalJunction);
  console.log(`[seeder] ${junctionSteps.length} critical junctions identified`);

  const partialJunctions = junctionSteps.map(buildJunctionFromStep);

  // Generate v1 fields and v2 synthesis in parallel
  const [v1, synthesis] = await Promise.all([
    generateV1Theory(eco, name),
    partialJunctions.length > 0
      ? synthesizeWithClaude(eco, name, mainLine, partialJunctions)
      : Promise.resolve(null),
  ]);

  // Merge junction data with Claude's descriptions/explanations
  const criticalJunctions: CriticalJunction[] = partialJunctions.map((j) => {
    const synthesized = synthesis?.junctions.find((s) => s.fen === j.fen);
    return {
      ...j,
      description: synthesized?.description ?? `Critical decision at move ${j.move_number}`,
      mistake_explanation: synthesized?.mistake_explanation ?? `Playing ${j.common_mistakes[0] ?? "an inaccuracy"} misses the key opening idea.`,
    };
  });

  const theory: OpeningTheory = {
    eco,
    eco_family: eco.slice(0, eco.length - 1),
    opening_name: name,
    ...v1,
    critical_junctions: criticalJunctions,
    transition_move: synthesis?.transition_move ?? 12,
    resulting_structure: synthesis?.resulting_structure ?? "",
    structure_demands: synthesis?.structure_demands ?? [],
    theory_move_sequence: mainLine.map((s) => s.move),
    seeded_at: new Date().toISOString(),
  };

  await upsertOpeningTheory(theory);
  console.log(`[seeder] ✓ ${eco} seeded — ${criticalJunctions.length} junctions, transition at move ${theory.transition_move}`);
}

// ─── Batch seed script ────────────────────────────────────────────────────────

const TOP_ECOS: Array<{ eco: string; name: string }> = [
  { eco: "B20", name: "Sicilian Defence" },
  { eco: "B23", name: "Sicilian Defence, Closed" },
  { eco: "B50", name: "Sicilian Defense: Wing Gambit Deferred" },
  { eco: "B70", name: "Sicilian Defence, Dragon" },
  { eco: "B90", name: "Sicilian Defence, Najdorf" },
  { eco: "C00", name: "French Defence" },
  { eco: "C01", name: "French Defence, Exchange" },
  { eco: "C11", name: "French Defence, Classical" },
  { eco: "B10", name: "Caro-Kann Defence" },
  { eco: "B17", name: "Caro-Kann Defence, Steinitz" },
  { eco: "C60", name: "Ruy Lopez" },
  { eco: "C65", name: "Ruy Lopez, Berlin Defence" },
  { eco: "C84", name: "Ruy Lopez, Closed" },
  { eco: "C50", name: "Italian Game" },
  { eco: "C54", name: "Italian Game, Classical" },
  { eco: "C55", name: "Italian Game, Two Knights" },
  { eco: "D06", name: "Queen's Gambit" },
  { eco: "D20", name: "Queen's Gambit Accepted" },
  { eco: "D30", name: "Queen's Gambit Declined" },
  { eco: "D43", name: "Queen's Gambit Declined, Semi-Slav" },
  { eco: "E60", name: "King's Indian Defence" },
  { eco: "E70", name: "King's Indian Defence, 4.e4" },
  { eco: "E97", name: "King's Indian Defence, Orthodox" },
  { eco: "E15", name: "Queen's Indian Defence" },
  { eco: "E20", name: "Nimzo-Indian Defence" },
  { eco: "E32", name: "Nimzo-Indian Defence, Classical" },
  { eco: "A10", name: "English Opening" },
  { eco: "A04", name: "Réti Opening" },
  { eco: "C42", name: "Petrov's Defence" },
  { eco: "C44", name: "King's Pawn, Open Games" },
  { eco: "D02", name: "London System" },
];

async function main() {
  console.log(`Seeding ${TOP_ECOS.length} openings (v2)...`);
  let success = 0, failed = 0;
  for (const { eco, name } of TOP_ECOS) {
    try {
      await seedOpeningV2(eco, name);
      success++;
      await new Promise((r) => setTimeout(r, 800)); // rate limit
    } catch (err) {
      console.error(`✗ ${eco}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }
  console.log(`\nDone: ${success} seeded, ${failed} failed.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
