"use client";

import { useState } from "react";
import { UsernameForm } from "../components/UsernameForm";
import { OpeningRanking } from "../components/OpeningRanking";
import { ProgressFeed } from "../components/ProgressFeed";
import { ImprovementPlan } from "../components/ImprovementPlan";
import type { OpeningStats, LessonCard, ImprovementPlan as ImprovementPlanType } from "../lib/types";

type Phase = "idle" | "analyzing" | "pick" | "coaching" | "done";

const FREE_LIMIT = 3;
const STORAGE_KEY = "chess_coach_analyses";

function getAnalysisCount(): number {
  try {
    return parseInt(localStorage.getItem(STORAGE_KEY) ?? "0", 10);
  } catch {
    return 0;
  }
}

function incrementAnalysisCount(): void {
  try {
    const count = getAnalysisCount();
    localStorage.setItem(STORAGE_KEY, String(count + 1));
  } catch {}
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<string[]>([]);
  const [openings, setOpenings] = useState<OpeningStats[]>([]);
  const [lessonCards, setLessonCards] = useState<LessonCard[]>([]);
  const [plan, setPlan] = useState<ImprovementPlanType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showByok, setShowByok] = useState(false);
  const [selectedOpening, setSelectedOpening] = useState<{ eco: string; name: string } | null>(null);
  const [username, setUsername] = useState("");

  async function handleAnalyze(u: string) {
    setUsername(u);
    setPhase("analyzing");
    setProgress([]);
    setOpenings([]);
    setError(null);

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u }),
    });

    const reader = res.body?.getReader();
    if (!reader) {
      setError("No response stream");
      setPhase("idle");
      return;
    }

    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.type === "progress") {
            setProgress((p) => [...p, event.message as string]);
          } else if (event.type === "openings") {
            setOpenings(event.openings as OpeningStats[]);
            setPhase("pick");
          } else if (event.type === "error") {
            setError(event.message as string);
            setPhase("idle");
          }
        } catch {}
      }
    }
  }

  async function handlePickOpening(eco: string, name: string, userApiKey?: string) {
    const count = getAnalysisCount();
    const effectiveKey = userApiKey ?? apiKey;

    if (count >= FREE_LIMIT && !effectiveKey) {
      setSelectedOpening({ eco, name });
      setShowByok(true);
      return;
    }

    setSelectedOpening({ eco, name });
    setPhase("coaching");
    setProgress([]);
    setLessonCards([]);
    setPlan(null);
    setError(null);

    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        eco,
        opening_name: name,
        apiKey: effectiveKey || undefined,
      }),
    });

    const reader = res.body?.getReader();
    if (!reader) {
      setError("No response stream");
      setPhase("pick");
      return;
    }

    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.type === "progress") {
            setProgress((p) => [...p, event.message as string]);
          } else if (event.type === "position") {
            setLessonCards((c) => [...c, event.card as LessonCard]);
          } else if (event.type === "plan") {
            setPlan(event.plan as ImprovementPlanType);
          } else if (event.type === "done") {
            setPhase("done");
            incrementAnalysisCount();
          } else if (event.type === "error") {
            setError(event.message as string);
            setPhase("pick");
          }
        } catch {}
      }
    }
  }

  function handleByokSubmit() {
    if (!apiKey || !selectedOpening) return;
    setShowByok(false);
    handlePickOpening(selectedOpening.eco, selectedOpening.name, apiKey);
  }

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Chess Coach</h1>
        <p className="text-[#888] text-sm">
          Stockfish analysis + Claude coaching — understand your opening mistakes
        </p>
      </header>

      {/* BYOK modal */}
      {showByok && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-8 max-w-md w-full space-y-4">
            <h2 className="text-xl font-semibold">Free limit reached</h2>
            <p className="text-[#888] text-sm">
              You&apos;ve used {FREE_LIMIT} free analyses. Enter your Anthropic API key to continue.
            </p>
            <input
              type="password"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-[#333] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#666]"
            />
            <div className="flex gap-3">
              <button
                onClick={handleByokSubmit}
                className="flex-1 bg-white text-black rounded-lg py-2 text-sm font-medium hover:bg-[#ddd] transition-colors"
              >
                Continue
              </button>
              <button
                onClick={() => setShowByok(false)}
                className="flex-1 border border-[#333] rounded-lg py-2 text-sm hover:border-[#666] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "idle" && (
        <UsernameForm onSubmit={handleAnalyze} />
      )}

      {phase === "analyzing" && (
        <div className="space-y-6">
          <div className="text-[#888] text-sm">Analyzing your games with Stockfish...</div>
          <ProgressFeed messages={progress} />
        </div>
      )}

      {(phase === "pick" || phase === "coaching" || phase === "done") && (
        <div className="space-y-10">
          <OpeningRanking
            openings={openings}
            onPick={(eco, name) => handlePickOpening(eco, name)}
            disabled={phase === "coaching"}
          />

          {(phase === "coaching" || phase === "done") && (
            <div className="space-y-8">
              {selectedOpening && (
                <h2 className="text-xl font-semibold">
                  Coaching: {selectedOpening.name}
                </h2>
              )}

              {phase === "coaching" && progress.length > 0 && (
                <ProgressFeed messages={progress} />
              )}

              {lessonCards.length > 0 && (
                <div className="space-y-6">
                  {lessonCards.map((card) => (
                    <LessonCard key={card.position_id} card={card} />
                  ))}
                </div>
              )}

              {plan && <ImprovementPlan plan={plan} />}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}

// Inline LessonCard component to avoid circular deps in page
function LessonCard({ card }: { card: LessonCard }) {
  const severityColors: Record<string, string> = {
    blunder: "text-red-400",
    high: "text-orange-400",
    medium: "text-yellow-400",
    low: "text-green-400",
  };

  const confidenceBadge: Record<string, string> = {
    green: "bg-green-900/50 text-green-300 border-green-700",
    yellow: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
    red: "bg-red-900/50 text-red-300 border-red-700",
  };

  const confidenceLabel: Record<string, string> = {
    green: "✓ Verified",
    yellow: "~ Partial",
    red: "✗ Low confidence",
  };

  return (
    <div className="border border-[#2a2a2a] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-[#1a1a1a] px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm font-mono">
          <span className="text-[#666]">{card.position_id}</span>
          <span className={`font-bold ${severityColors[card.severity] ?? "text-white"}`}>
            -{card.cp_loss}cp · {card.severity.toUpperCase()}
          </span>
          <span className="text-[#666] capitalize">{card.category}</span>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded border ${confidenceBadge[card.coach_confidence] ?? ""}`}
        >
          {confidenceLabel[card.coach_confidence]}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-4 space-y-4">
        {/* Moves */}
        <div className="flex gap-6 text-sm font-mono">
          <div>
            <span className="text-[#666]">played </span>
            <span className="text-red-400">{card.player_move}</span>
          </div>
          <div>
            <span className="text-[#666]">best </span>
            <span className="text-green-400">{card.best_move}</span>
          </div>
        </div>

        <p className="text-sm leading-relaxed">{card.explanation}</p>

        <div className="space-y-2 text-sm">
          <div>
            <span className="text-[#666]">KEY LESSON: </span>
            <span>{card.key_lesson}</span>
          </div>
          <div>
            <span className="text-[#666]">NEXT TIME: </span>
            <span className="italic">{card.heuristic}</span>
          </div>
        </div>

        {(card.tactical_flags.length > 0 || card.structural_flags.length > 0) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {[...card.tactical_flags, ...card.structural_flags].map((flag) => (
              <span
                key={flag}
                className="text-xs px-2 py-0.5 rounded bg-[#1a1a1a] border border-[#333] text-[#888]"
              >
                {flag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
