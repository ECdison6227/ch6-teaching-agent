"use client";

import { motion } from "motion/react";
import type { Mastery } from "@/lib/progress/model";

/** 小号掌握度圆环：待练时画虚线圈；有分数时弧线转着填满。 */
export function MasteryRing({ m, size = 18 }: { m: Mastery; size?: number }) {
  const r = size / 2 - 1.6;
  const value = m.score ?? 0;
  const pending = m.score === null;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mastery-ring" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} className={pending ? "ring-track ring-pending" : "ring-track"} />
      {!pending ? (
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          className={value >= 0.8 ? "ring-value ring-done" : "ring-value"}
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: Math.max(0.04, value) }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ rotate: -90, transformOrigin: "50% 50%" }}
        />
      ) : null}
    </svg>
  );
}

export function masteryLabel(m: Mastery, pages?: number): string {
  if (m.score !== null) return `${Math.round(m.score * 100)}%`;
  if (m.answered > 0) return `待练 · 已做 ${m.answered}`;
  if (m.coverage !== null && m.coverage > 0) return `已看 ${Math.round(m.coverage * 100)}%`;
  return pages ? `${pages} 页` : "习题";
}
