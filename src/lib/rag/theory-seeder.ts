/**
 * One-time offline script to seed the opening_theory table.
 * Run: pnpm seed:theory
 *
 * Generates structured chess opening theory for the top 50 ECO codes
 * using Claude Sonnet, then stores in Supabase.
 */

import Anthropic from "@anthropic-ai/sdk";
import { upsertOpeningTheory } from "../db/supabase";
import type { OpeningTheory } from "../types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Top 50 ECO codes by frequency (covers ~90% of online games)
const TOP_50_ECOS: Array<{ eco: string; name: string }> = [
  // Sicilian
  { eco: "B20", name: "Sicilian Defence" },
  { eco: "B23", name: "Sicilian Defence, Closed" },
  { eco: "B70", name: "Sicilian Defence, Dragon" },
  { eco: "B90", name: "Sicilian Defence, Najdorf" },
  // French
  { eco: "C00", name: "French Defence" },
  { eco: "C01", name: "French Defence, Exchange" },
  { eco: "C11", name: "French Defence, Classical" },
  // Caro-Kann
  { eco: "B10", name: "Caro-Kann Defence" },
  { eco: "B17", name: "Caro-Kann Defence, Steinitz" },
  // Ruy Lopez
  { eco: "C60", name: "Ruy Lopez" },
  { eco: "C65", name: "Ruy Lopez, Berlin Defence" },
  { eco: "C84", name: "Ruy Lopez, Closed" },
  // Italian
  { eco: "C50", name: "Italian Game" },
  { eco: "C54", name: "Italian Game, Classical" },
  { eco: "C55", name: "Italian Game, Two Knights" },
  // Queen's Gambit
  { eco: "D06", name: "Queen's Gambit" },
  { eco: "D20", name: "Queen's Gambit Accepted" },
  { eco: "D30", name: "Queen's Gambit Declined" },
  { eco: "D43", name: "Queen's Gambit Declined, Semi-Slav" },
  // King's Indian
  { eco: "E60", name: "King's Indian Defence" },
  { eco: "E70", name: "King's Indian Defence, 4.e4" },
  { eco: "E97", name: "King's Indian Defence, Orthodox" },
  // Nimzo-Indian / Queen's Indian
  { eco: "E15", name: "Queen's Indian Defence" },
  { eco: "E20", name: "Nimzo-Indian Defence" },
  { eco: "E32", name: "Nimzo-Indian Defence, Classical" },
  // English / Réti
  { eco: "A10", name: "English Opening" },
  { eco: "A04", name: "Réti Opening" },
  // King's Pawn misc
  { eco: "C42", name: "Petrov's Defence" },
  { eco: "C44", name: "King's Pawn, Open Games" },
  // London / Catalan
  { eco: "D02", name: "London System" },
];

async function generateTheory(eco: string, name: string): Promise<OpeningTheory> {
  const ecoFamily = eco.slice(0, eco.length - 1);

  const prompt = `You are a chess coach. Generate structured opening theory for "${name}" (ECO ${eco}).

Return ONLY valid JSON with this exact structure:
{
  "main_ideas": ["string", ...],
  "typical_plans": ["string", ...],
  "common_mistakes": ["string", ...],
  "key_thematic_moves": ["string", ...],
  "positional_themes": ["string", ...],
  "theory_summary": "string"
}

Guidelines:
- main_ideas: 3-5 core strategic concepts for this opening (e.g., "fight for the center with ...d5")
- typical_plans: 3-5 concrete plans each side pursues (e.g., "queenside minority attack with b4-b5")
- common_mistakes: 3-5 frequent errors at club level (e.g., "premature attack without castling")
- key_thematic_moves: 4-8 important moves or move patterns (e.g., "...d5", "f4-f5", "Nd5")
- positional_themes: 3-5 structural/positional concepts (e.g., "isolated d-pawn", "open c-file")
- theory_summary: 2-3 sentence prose overview of the opening's character and key ideas

Be specific and concrete. Focus on practical club-level understanding, not grandmaster subtlety.`;

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

  // Strip markdown fences if present
  const jsonStr = text
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  const parsed = JSON.parse(jsonStr) as Omit<
    OpeningTheory,
    "eco" | "eco_family" | "opening_name"
  >;

  return {
    eco,
    eco_family: ecoFamily,
    opening_name: name,
    main_ideas: parsed.main_ideas ?? [],
    typical_plans: parsed.typical_plans ?? [],
    common_mistakes: parsed.common_mistakes ?? [],
    key_thematic_moves: parsed.key_thematic_moves ?? [],
    positional_themes: parsed.positional_themes ?? [],
    theory_summary: parsed.theory_summary ?? "",
  };
}

async function main() {
  console.log(`Seeding ${TOP_50_ECOS.length} openings...`);
  let success = 0;
  let failed = 0;

  for (const { eco, name } of TOP_50_ECOS) {
    try {
      process.stdout.write(`  ${eco} ${name}... `);
      const theory = await generateTheory(eco, name);
      await upsertOpeningTheory(theory);
      console.log("✓");
      success++;
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.log(`✗ ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} seeded, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
