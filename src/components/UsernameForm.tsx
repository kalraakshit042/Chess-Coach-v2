"use client";

import { useState } from "react";

export interface AnalyzeParams {
  username: string;
  perfType: string;
  since: number;
}

interface Props {
  onSubmit: (params: AnalyzeParams) => void;
}

const SPEED_OPTIONS = [
  { value: "bullet", label: "Bullet" },
  { value: "blitz", label: "Blitz" },
  { value: "rapid", label: "Rapid" },
  { value: "classical", label: "Classical" },
];

const PERIOD_OPTIONS = [
  { value: 7, label: "1 week" },
  { value: 30, label: "1 month" },
  { value: 90, label: "3 months" },
  { value: 180, label: "6 months" },
];

export function UsernameForm({ onSubmit }: Props) {
  const [username, setUsername] = useState("noob042");
  const [perfType, setPerfType] = useState("rapid");
  const [days, setDays] = useState(30);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    onSubmit({ username: trimmed, perfType, since });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="username" className="block text-sm text-[#888]">
          Lichess username
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. DrNykterstein"
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#555] transition-colors"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="perfType" className="block text-sm text-[#888]">
            Game type
          </label>
          <select
            id="perfType"
            value={perfType}
            onChange={(e) => setPerfType(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#555] transition-colors"
          >
            {SPEED_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="period" className="block text-sm text-[#888]">
            Time period
          </label>
          <select
            id="period"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#555] transition-colors"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={!username.trim()}
        className="bg-white text-black rounded-xl px-6 py-3 text-sm font-medium disabled:opacity-40 hover:bg-[#ddd] transition-colors"
      >
        Analyze my openings
      </button>
      <p className="text-xs text-[#555]">
        Fetches all games in the selected time period. Stockfish analysis runs locally.
      </p>
    </form>
  );
}
