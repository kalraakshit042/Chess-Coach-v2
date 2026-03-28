import { createClient } from "@supabase/supabase-js";
import type {
  PositionEval,
  LessonCard,
  OpeningTheory,
  ImprovementPlan,
  MistakeClassification,
  BestMoveIntent,
  PlayedMoveFailure,
  FaithfulnessCritique,
} from "../types";

// ─── Client ───────────────────────────────────────────────────────────────────

function getClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables"
    );
  }

  return createClient(url, key);
}

// ─── Position Evals (Stockfish cache) ────────────────────────────────────────

export async function getCachedEval(fen: string): Promise<PositionEval | null> {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from("position_evals")
      .select("*")
      .eq("fen", fen)
      .single();

    if (error || !data) return null;
    return data as unknown as PositionEval;
  } catch {
    return null;
  }
}

export async function storeCachedEval(
  fen: string,
  evalData: PositionEval
): Promise<void> {
  try {
    const supabase = getClient();
    await supabase.from("position_evals").upsert(
      {
        fen,
        best_move: evalData.best_move,
        top_moves: evalData.top_moves,
        eval_cp: evalData.cp_after,
        pv_best: evalData.pv_best,
        pv_played: evalData.pv_played,
        tactical_flags: evalData.tactical_flags,
        structural_flags: evalData.structural_flags,
        depth: evalData.depth,
      },
      { onConflict: "fen" }
    );
  } catch {
    // Cache write failure is non-fatal — analysis continues
  }
}

// ─── Position Analyses (Claude agent cache) ───────────────────────────────────

export async function getCachedAnalysis(
  positionId: string,
  username: string
): Promise<LessonCard | null> {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from("position_analyses")
      .select("lesson_card")
      .eq("position_id", positionId)
      .eq("username", username)
      .single();

    if (error || !data?.lesson_card) return null;
    return data.lesson_card as LessonCard;
  } catch {
    return null;
  }
}

export async function storeCachedAnalysis(
  positionId: string,
  username: string,
  card: LessonCard,
  rawOutputs: {
    classification: MistakeClassification;
    intent: BestMoveIntent;
    failure: PlayedMoveFailure;
    critique: FaithfulnessCritique;
  }
): Promise<void> {
  try {
    const supabase = getClient();
    await supabase.from("position_analyses").upsert(
      {
        position_id: positionId,
        username,
        fen: card.position_id,
        player_move: rawOutputs.classification.mistake_type,
        cp_loss: card.cp_loss,
        mistake_classification: rawOutputs.classification,
        best_move_intent: rawOutputs.intent,
        played_move_failure: rawOutputs.failure,
        coach_explanation: {
          explanation: card.explanation,
          key_lesson: card.key_lesson,
          heuristic: card.heuristic,
        },
        faithfulness_critique: rawOutputs.critique,
        lesson_card: card,
        coach_confidence: card.coach_confidence,
      },
      { onConflict: "position_id,username" }
    );
  } catch {
    // Cache write failure is non-fatal
  }
}

// ─── Opening Theory (RAG) ─────────────────────────────────────────────────────

export async function getOpeningTheory(
  eco: string
): Promise<OpeningTheory | null> {
  try {
    const supabase = getClient();

    // 1. Exact ECO match
    const { data: exact } = await supabase
      .from("opening_theory")
      .select("*")
      .eq("eco", eco)
      .single();

    if (exact) return exact as unknown as OpeningTheory;

    // 2. Family fallback (e.g., "B90" → "B9")
    const family = eco.slice(0, eco.length - 1);
    const { data: family_match } = await supabase
      .from("opening_theory")
      .select("*")
      .eq("eco_family", family)
      .limit(1)
      .single();

    return (family_match as unknown as OpeningTheory) ?? null;
  } catch {
    return null;
  }
}

export async function upsertOpeningTheory(
  theory: OpeningTheory
): Promise<void> {
  const supabase = getClient();
  await supabase.from("opening_theory").upsert(theory, { onConflict: "eco" });
}

// ─── Improvement Plans ────────────────────────────────────────────────────────

export async function getCachedImprovementPlan(
  username: string,
  eco: string
): Promise<ImprovementPlan | null> {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from("improvement_plans")
      .select("plan")
      .eq("username", username)
      .eq("eco", eco)
      .single();

    if (error || !data?.plan) return null;
    return data.plan as ImprovementPlan;
  } catch {
    return null;
  }
}

export async function storeCachedImprovementPlan(
  username: string,
  eco: string,
  plan: ImprovementPlan,
  lessonCards: LessonCard[]
): Promise<void> {
  try {
    const supabase = getClient();
    await supabase.from("improvement_plans").upsert(
      { username, eco, plan, lesson_cards: lessonCards },
      { onConflict: "username,eco" }
    );
  } catch {
    // Non-fatal
  }
}

// ─── Database Schema SQL (for reference / migration) ─────────────────────────
export const SCHEMA_SQL = `
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS position_evals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fen         TEXT NOT NULL UNIQUE,
  best_move   TEXT NOT NULL,
  top_moves   JSONB NOT NULL,
  eval_cp     INTEGER NOT NULL,
  pv_best     JSONB NOT NULL,
  pv_played   JSONB,
  tactical_flags  JSONB,
  structural_flags JSONB,
  depth       INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS position_analyses (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id             TEXT NOT NULL,
  username                TEXT NOT NULL,
  fen                     TEXT,
  player_move             TEXT,
  cp_loss                 INTEGER,
  mistake_classification  JSONB,
  best_move_intent        JSONB,
  played_move_failure     JSONB,
  coach_explanation       JSONB,
  faithfulness_critique   JSONB,
  lesson_card             JSONB,
  coach_confidence        TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE (position_id, username)
);

CREATE TABLE IF NOT EXISTS opening_theory (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eco                  TEXT NOT NULL UNIQUE,
  eco_family           TEXT NOT NULL,
  opening_name         TEXT NOT NULL,
  main_ideas           TEXT[] NOT NULL,
  typical_plans        TEXT[] NOT NULL,
  common_mistakes      TEXT[] NOT NULL,
  key_thematic_moves   TEXT[] NOT NULL,
  positional_themes    TEXT[] NOT NULL,
  theory_summary       TEXT NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS improvement_plans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username     TEXT NOT NULL,
  eco          TEXT NOT NULL,
  plan         JSONB NOT NULL,
  lesson_cards JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (username, eco)
);
`;
