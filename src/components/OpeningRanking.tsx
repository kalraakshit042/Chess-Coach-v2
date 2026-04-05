"use client";

import type { OpeningStats } from "../lib/types";

interface Props {
  openings: OpeningStats[];
  onPick: (opening: OpeningStats) => void;
  disabled?: boolean;
}

export function OpeningRanking({ openings, onPick, disabled }: Props) {
  const strong = openings
    .filter((o) => o.performance === "strong")
    .sort((a, b) => b.win_rate - a.win_rate);
  const average = openings
    .filter((o) => o.performance === "average")
    .sort((a, b) => a.win_rate - b.win_rate); // worst first
  const needsWork = openings
    .filter((o) => o.performance === "needs_work")
    .sort((a, b) => a.win_rate - b.win_rate); // worst first

  if (openings.length === 0) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Your Openings</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <OpeningGroup
          label="Strong"
          color="text-green-400"
          borderColor="border-green-900"
          openings={strong}
          onPick={onPick}
          disabled={disabled}
        />
        <OpeningGroup
          label="Average"
          color="text-yellow-400"
          borderColor="border-yellow-900"
          openings={average}
          onPick={onPick}
          disabled={disabled}
        />
        <OpeningGroup
          label="Needs Work"
          color="text-red-400"
          borderColor="border-red-900"
          openings={needsWork}
          onPick={onPick}
          disabled={disabled}
        />
      </div>

      <p className="text-xs text-[#555]">
        Click an average or needs-work opening to get detailed AI coaching.
      </p>
    </div>
  );
}

function OpeningGroup({
  label,
  color,
  borderColor,
  openings,
  onPick,
  disabled,
}: {
  label: string;
  color: string;
  borderColor: string;
  openings: OpeningStats[];
  onPick: (opening: OpeningStats) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`border ${borderColor} rounded-xl p-4 space-y-3`}>
      <h3 className={`text-xs font-semibold uppercase tracking-widest ${color}`}>{label}</h3>
      {openings.length === 0 ? (
        <p className="text-[#555] text-xs">—</p>
      ) : (
        <ul className="space-y-2">
          {openings.map((o) => (
            <li key={o.eco}>
              <button
                onClick={() => onPick(o)}
                disabled={disabled}
                className="w-full text-left group disabled:cursor-not-allowed bg-[#111] hover:bg-[#1a1a1a] border border-[#222] hover:border-[#333] rounded-lg px-3 py-3 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium group-hover:text-white transition-colors leading-tight">
                    {o.name}
                  </span>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${color}`}>
                    {Math.round(o.win_rate * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-[#666]">
                  <span className="font-mono">{o.eco}</span>
                  <span className="text-green-600">{o.wins}W</span>
                  <span className="text-[#555]">{o.draws}D</span>
                  <span className="text-red-700">{o.losses}L</span>
                  {o.avg_cp_loss > 0 && (
                    <span className="text-[#444]">-{o.avg_cp_loss}cp</span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
