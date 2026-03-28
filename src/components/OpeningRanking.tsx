"use client";

import type { OpeningStats } from "../lib/types";

interface Props {
  openings: OpeningStats[];
  onPick: (eco: string, name: string) => void;
  disabled?: boolean;
}

export function OpeningRanking({ openings, onPick, disabled }: Props) {
  const strong = openings.filter((o) => o.performance === "strong");
  const average = openings.filter((o) => o.performance === "average");
  const weak = openings.filter((o) => o.performance === "weak");

  if (openings.length === 0) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Your Openings</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          label="Weak"
          color="text-red-400"
          borderColor="border-red-900"
          openings={weak}
          onPick={onPick}
          disabled={disabled}
        />
      </div>

      <p className="text-xs text-[#555]">
        Click a weak or average opening to get detailed AI coaching.
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
  onPick: (eco: string, name: string) => void;
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
                onClick={() => onPick(o.eco, o.name)}
                disabled={disabled}
                className="w-full text-left group disabled:cursor-not-allowed"
              >
                <div className="text-sm font-medium group-hover:text-white transition-colors truncate">
                  {o.name}
                </div>
                <div className="text-xs text-[#666] flex gap-3 mt-0.5">
                  <span>{o.eco}</span>
                  <span>avg -{o.avg_cp_loss}cp</span>
                  <span>
                    {o.wins}W/{o.losses}L/{o.draws}D
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
