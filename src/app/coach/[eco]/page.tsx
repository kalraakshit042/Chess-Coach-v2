"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { LessonCard, ImprovementPlan, OpeningStats } from "../../../lib/types";
import { ImprovementPlan as ImprovementPlanComponent } from "../../../components/ImprovementPlan";

interface SessionData {
  username: string;
  opening: OpeningStats;
}

interface LogEntry {
  ts: string;
  message: string;
}

function timestamp() {
  return new Date().toISOString().slice(11, 19); // HH:MM:SS
}

export default function CoachPage() {
  const params = useParams();
  const router = useRouter();
  const eco = decodeURIComponent(params.eco as string);

  const [session, setSession] = useState<SessionData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [cards, setCards] = useState<LessonCard[]>([]);
  const [plan, setPlan] = useState<ImprovementPlan | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logBottomRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    setLogs((l) => [...l, { ts: timestamp(), message: msg }]);
  };

  useEffect(() => {
    logBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  useEffect(() => {
    const raw = sessionStorage.getItem("chess_coach_session");
    if (!raw) {
      setError("Session expired — go back and click an opening again.");
      return;
    }
    const data = JSON.parse(raw) as SessionData;
    setSession(data);
  }, []);

  useEffect(() => {
    if (!session) return;

    const { username, opening } = session;
    const apiKey = localStorage.getItem("chess_coach_api_key") ?? undefined;

    addLog(`Starting coaching for ${opening.name} (${eco})`);
    addLog(`${opening.games_played} games · ${Math.round(opening.win_rate * 100)}% score`);

    let cancelled = false;

    async function run() {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          eco,
          opening_name: opening.name,
          apiKey,
        }),
      });

      if (res.status === 401) {
        setError("Missing ANTHROPIC_API_KEY in .env.local — restart the dev server after adding it.");
        return;
      }
      if (!res.ok) {
        setError(`API error ${res.status} — check terminal logs.`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setError("No stream"); return; }

      const decoder = new TextDecoder();
      let buf = "";

      while (!cancelled) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as Record<string, unknown>;
            if (event.type === "progress") {
              addLog(event.message as string);
            } else if (event.type === "position") {
              setCards((c) => [...c, event.card as LessonCard]);
              addLog(`[info] Lesson card ready: ${(event.card as LessonCard).position_id}`);
            } else if (event.type === "plan") {
              setPlan(event.plan as ImprovementPlan);
              addLog(`[info] Improvement plan generated`);
            } else if (event.type === "done") {
              setDone(true);
              addLog(`[info] ✓ Done`);
            } else if (event.type === "error") {
              setError(event.message as string);
              addLog(`[error] ${event.message}`);
            }
          } catch {}
        }
      }
    }

    run();
    return () => { cancelled = true; };
  }, [session]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="text-[#666] hover:text-white text-sm font-mono transition-colors"
        >
          ← back
        </button>
        <div>
          <h1 className="text-lg font-bold">{session?.opening.name ?? eco}</h1>
          {session && (
            <p className="text-xs text-[#555] font-mono">
              {eco} · {session.opening.games_played}G · {session.opening.wins}W {session.opening.draws}D {session.opening.losses}L · {Math.round(session.opening.win_rate * 100)}% score
            </p>
          )}
        </div>
        {!done && !error && (
          <span className="ml-auto flex items-center gap-2 text-xs text-[#555] font-mono">
            <span className="w-1.5 h-1.5 bg-green-600 rounded-full animate-pulse inline-block" />
            running
          </span>
        )}
        {done && (
          <span className="ml-auto text-xs text-green-600 font-mono">✓ complete</span>
        )}
      </div>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Left: log terminal */}
        <div className="w-2/5 border-r border-[#1a1a1a] flex flex-col">
          <div className="px-4 py-2 border-b border-[#1a1a1a] text-xs text-[#444] font-mono uppercase tracking-widest">
            pipeline log
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5 font-mono text-xs">
            {logs.map((log, i) => {
              const isLast = i === logs.length - 1;
              return (
                <div key={i} className={`flex gap-2 leading-5 ${isLast ? "text-[#aaa]" : "text-[#444]"}`}>
                  <span className="shrink-0">{log.ts}</span>
                  <span className={isLast && !done ? "text-green-500" : "text-[#333]"}>›</span>
                  <span className="break-all">{log.message}</span>
                </div>
              );
            })}
            <div ref={logBottomRef} />
          </div>
        </div>

        {/* Right: results */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {cards.length === 0 && !done && !error && (
            <p className="text-[#444] text-sm font-mono">Waiting for first lesson card...</p>
          )}

          {cards.length === 0 && done && !error && (
            <p className="text-[#666] text-sm">No significant mistakes found in this opening (all moves within 150cp of best).</p>
          )}

          {cards.map((card) => (
            <LessonCard key={card.position_id} card={card} />
          ))}

          {plan && <ImprovementPlanComponent plan={plan} />}
        </div>
      </div>
    </div>
  );
}

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
      <div className="bg-[#1a1a1a] px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm font-mono">
          <span className="text-[#666]">{card.position_id}</span>
          <span className={`font-bold ${severityColors[card.severity] ?? "text-white"}`}>
            -{card.cp_loss}cp · {card.severity.toUpperCase()}
          </span>
          <span className="text-[#666] capitalize">{card.category}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded border ${confidenceBadge[card.coach_confidence] ?? ""}`}>
          {confidenceLabel[card.coach_confidence]}
        </span>
      </div>
      <div className="px-4 py-4 space-y-4">
        <div className="flex gap-6 text-sm font-mono">
          <div><span className="text-[#666]">played </span><span className="text-red-400">{card.player_move}</span></div>
          <div><span className="text-[#666]">best </span><span className="text-green-400">{card.best_move}</span></div>
        </div>
        <p className="text-sm leading-relaxed">{card.explanation}</p>
        <div className="space-y-2 text-sm">
          <div><span className="text-[#666]">KEY LESSON: </span><span>{card.key_lesson}</span></div>
          <div><span className="text-[#666]">NEXT TIME: </span><span className="italic">{card.heuristic}</span></div>
        </div>
        {(card.tactical_flags.length > 0 || card.structural_flags.length > 0) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {[...card.tactical_flags, ...card.structural_flags].map((flag) => (
              <span key={flag} className="text-xs px-2 py-0.5 rounded bg-[#1a1a1a] border border-[#333] text-[#888]">
                {flag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
