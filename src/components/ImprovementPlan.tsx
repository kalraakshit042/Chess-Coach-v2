"use client";

import type { ImprovementPlan } from "../lib/types";

interface Props {
  plan: ImprovementPlan;
}

export function ImprovementPlan({ plan }: Props) {
  return (
    <div className="border border-[#2a2a2a] rounded-xl overflow-hidden">
      <div className="bg-[#1a1a1a] px-4 py-3">
        <h3 className="text-sm font-semibold">Improvement Plan</h3>
      </div>

      <div className="px-4 py-4 space-y-5">
        {plan.top_weaknesses.length > 0 && (
          <div>
            <h4 className="text-xs uppercase tracking-widest text-red-400 mb-2">
              Top Weaknesses
            </h4>
            <ul className="space-y-1">
              {plan.top_weaknesses.map((w, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-[#555]">{i + 1}.</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan.reliable_areas.length > 0 && (
          <div>
            <h4 className="text-xs uppercase tracking-widest text-green-400 mb-2">
              Reliable Areas
            </h4>
            <ul className="space-y-1">
              {plan.reliable_areas.map((a, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-[#555]">+</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan.low_trust_areas.length > 0 && (
          <div>
            <h4 className="text-xs uppercase tracking-widest text-yellow-400 mb-2">
              Low Confidence Areas
            </h4>
            <ul className="space-y-1">
              {plan.low_trust_areas.map((a, i) => (
                <li key={i} className="text-sm flex gap-2 text-[#888]">
                  <span className="text-[#555]">~</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h4 className="text-xs uppercase tracking-widest text-[#666] mb-2">
            Study Plan
          </h4>
          <p className="text-sm leading-relaxed text-[#ccc]">{plan.study_plan}</p>
        </div>
      </div>
    </div>
  );
}
