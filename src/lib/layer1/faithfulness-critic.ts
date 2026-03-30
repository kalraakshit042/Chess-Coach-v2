import Anthropic from "@anthropic-ai/sdk";
import type {
  EvidencePacket,
  MistakeClassification,
  BestMoveIntent,
  PlayedMoveFailure,
  CoachExplanation,
  CoachMode,
  FaithfulnessCritique,
  CoachConfidence,
} from "../types";
import { runCoach } from "./coach";

const CRITIC_SYSTEM = `You are a faithfulness critic for chess coaching explanations.
Verify that every factual claim in the explanation is supported by the engine evidence provided.
Respond ONLY with valid JSON. No markdown fences.

{
  "claims": [
    {
      "claim": string,
      "verdict": "supported" | "unsupported" | "contradicted",
      "evidence_refs": string[],
      "supported_by_theory": boolean,
      "contradicts_theory": boolean
    }
  ],
  "overall_verdict": "pass" | "partial" | "fail",
  "needs_revision": boolean,
  "revision_guidance": string
}

Rules for verifying claims:
- A claim about a move is SUPPORTED only if that move appears in: player_move, best_move, top_moves, pv_best_short, or pv_played_short
- A claim about evaluation (e.g., "loses a piece") is SUPPORTED if derivable from cp_loss / pv lines
- "unsupported" = claim may be true but can't be verified from the evidence
- "contradicted" = claim is provably wrong given the evidence
- contradicts_theory: set true if the claim directly contradicts a principle in the opening theory context (auto-"contradicted" verdict)
- needs_revision: true if any claim is "contradicted" or if > 1 claim is "unsupported"
- overall_verdict: "pass" if all supported, "partial" if 1 unsupported, "fail" if contradicted or >1 unsupported
- revision_guidance: specific instruction to fix the coach (empty string if no revision needed)`;

function computeConfidence(
  critique: FaithfulnessCritique,
  evidence: EvidencePacket,
  attempt: number
): CoachConfidence {
  if (critique.overall_verdict === "fail" && attempt >= 2) return "red";
  if (critique.overall_verdict === "pass" && evidence.best_move_gap_cp > 50) return "green";
  if (critique.overall_verdict === "pass") return "yellow";
  if (critique.overall_verdict === "partial") return "yellow";
  return "red";
}

export async function critique(
  evidence: EvidencePacket,
  explanation: CoachExplanation,
  classification: MistakeClassification,
  intent: BestMoveIntent,
  failure: PlayedMoveFailure,
  mode: CoachMode,
  apiKey: string,
  theoryContext?: string
): Promise<{ explanation: CoachExplanation; confidence: CoachConfidence; critique: FaithfulnessCritique }> {
  const client = new Anthropic({ apiKey });

  let currentExplanation = explanation;
  let attempt = 0;
  const maxAttempts = 2;

  while (attempt < maxAttempts) {
    const userContent = JSON.stringify({
      evidence,
      explanation: currentExplanation,
      opening_theory_context: theoryContext ?? null,
    });

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      temperature: 0,
      system: CRITIC_SYSTEM,
      messages: [{ role: "user", content: userContent }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");

    const jsonStr = text
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    const result = JSON.parse(jsonStr) as FaithfulnessCritique;
    attempt++;

    if (!result.needs_revision || attempt >= maxAttempts) {
      const confidence = computeConfidence(result, evidence, attempt);
      return { explanation: currentExplanation, confidence, critique: result };
    }

    // Revise: re-run coach with guidance from critic
    currentExplanation = await runCoach(
      evidence,
      classification,
      intent,
      failure,
      mode,
      apiKey,
      theoryContext,
      result.revision_guidance
    );
  }

  // Should not reach here but satisfy TypeScript
  const fallbackCritique: FaithfulnessCritique = {
    claims: [],
    overall_verdict: "fail",
    needs_revision: false,
    revision_guidance: "",
  };
  return { explanation: currentExplanation, confidence: "red", critique: fallbackCritique };
}
