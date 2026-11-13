"use client";

import { AnimatePresence, motion } from "motion/react";

/** 逐位滚动的数字：变化的那一位从下往上滚入，其余位不动。 */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span className={`rolling-number ${className ?? ""}`} aria-label={String(value)}>
      {digits.map((d, i) => (
        <span key={digits.length - i} className="rolling-digit" aria-hidden>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={d}
              initial={{ y: "70%", opacity: 0, filter: "blur(2px)" }}
              animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
              exit={{ y: "-70%", opacity: 0, filter: "blur(2px)" }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            >
              {d}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
