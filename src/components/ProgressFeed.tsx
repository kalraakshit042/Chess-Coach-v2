"use client";

interface Props {
  messages: string[];
}

export function ProgressFeed({ messages }: Props) {
  if (messages.length === 0) return null;

  return (
    <div className="space-y-1">
      {messages.map((msg, i) => (
        <div key={i} className="flex items-start gap-2 text-xs text-[#666] font-mono">
          <span className="text-[#444] mt-0.5">›</span>
          <span>{msg}</span>
        </div>
      ))}
      <div className="flex items-center gap-1 text-xs text-[#444] mt-2 font-mono">
        <span className="inline-block w-1.5 h-1.5 bg-[#444] rounded-full animate-pulse" />
        <span>working...</span>
      </div>
    </div>
  );
}
