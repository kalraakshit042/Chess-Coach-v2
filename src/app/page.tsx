"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UsernameForm, type AnalyzeParams } from "../components/UsernameForm";
import { OpeningRanking } from "../components/OpeningRanking";
import { ProgressFeed } from "../components/ProgressFeed";
import type { OpeningStats } from "../lib/types";

type Phase = "idle" | "analyzing" | "pick";

export default function Home() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<string[]>([]);
  const [openings, setOpenings] = useState<OpeningStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");

  async function handleAnalyze({ username: u, perfType, since }: AnalyzeParams) {
    setUsername(u);
    setPhase("analyzing");
    setProgress([]);
    setOpenings([]);
    setError(null);

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, perfType, since }),
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
            setProgress([]);
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

  function handlePickOpening(opening: OpeningStats) {
    sessionStorage.setItem("chess_coach_session", JSON.stringify({ username, opening }));
    router.push(`/coach/${encodeURIComponent(opening.eco)}`);
  }

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Chess Coach</h1>
        <p className="text-[#888] text-sm">
          Stockfish analysis + Claude coaching — understand your opening mistakes
        </p>
      </header>

      {phase === "idle" && (
        <UsernameForm onSubmit={handleAnalyze} />
      )}

      {phase === "analyzing" && (
        <div className="space-y-6">
          <div className="text-[#888] text-sm">Fetching and analyzing your games...</div>
          <ProgressFeed messages={progress} />
        </div>
      )}

      {phase === "pick" && (
        <div className="space-y-4">
          <OpeningRanking
            openings={openings}
            onPick={handlePickOpening}
          />
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
