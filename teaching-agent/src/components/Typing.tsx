"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { THINKING_STEP_LABELS, ThinkingIndicator } from "./ThinkingIndicator";

/** 等待首个 token 时的思考动画：粒子形变 + 五步进度文案（来自线上 thinking-renderer，已回源为组件） */
export function Thinking() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, THINKING_STEP_LABELS.length - 1)), 1700);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="thinking-row">
      <span className="thinking-canvas"><ThinkingIndicator active step={step} /></span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={step}
          className="thinking-label"
          initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
          transition={{ duration: 0.28 }}
        >
          {THINKING_STEP_LABELS[step]}
        </motion.span>
      </AnimatePresence>
      <span className="thinking-steps" aria-hidden>
        {THINKING_STEP_LABELS.map((_, i) => <span key={i} data-on={i <= step || undefined} />)}
      </span>
    </div>
  );
}

/** 流式输出时的打字光标 */
export function StreamingCaret() {
  return (
    <span className="ml-0.5 inline-block h-[15px] w-[2px] translate-y-[2px] animate-pulse bg-ink/70" />
  );
}
