"use client";

import { useState } from "react";

interface Props {
  onSubmit: (username: string) => void;
}

export function UsernameForm({ onSubmit }: Props) {
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
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
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. DrNykterstein"
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#555] transition-colors"
          autoFocus
        />
      </div>
      <button
        type="submit"
        disabled={!value.trim()}
        className="bg-white text-black rounded-xl px-6 py-3 text-sm font-medium disabled:opacity-40 hover:bg-[#ddd] transition-colors"
      >
        Analyze my openings
      </button>
      <p className="text-xs text-[#555]">
        Fetches your last 10 public games. Stockfish analysis runs locally.
      </p>
    </form>
  );
}
