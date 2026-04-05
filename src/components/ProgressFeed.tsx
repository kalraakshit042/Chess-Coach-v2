"use client";

import { useEffect, useRef } from "react";

interface Props {
  messages: string[];
  done?: boolean;
}

export function ProgressFeed({ messages, done }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) return null;

  return (
    <div className="font-mono text-xs space-y-0.5 max-h-48 overflow-y-auto pr-1">
      {messages.map((msg, i) => {
        const isLast = i === messages.length - 1;
        return (
          <div
            key={i}
            className={`flex items-start gap-2 transition-colors ${
              isLast ? "text-[#aaa]" : "text-[#444]"
            }`}
          >
            <span className={isLast ? "text-green-600" : "text-[#333]"}>
              {isLast && !done ? "▶" : "✓"}
            </span>
            <span>{msg}</span>
          </div>
        );
      })}
      {!done && (
        <div className="flex items-center gap-2 text-[#555] pt-1">
          <span className="inline-block w-1.5 h-1.5 bg-green-700 rounded-full animate-pulse" />
          <span>running...</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
