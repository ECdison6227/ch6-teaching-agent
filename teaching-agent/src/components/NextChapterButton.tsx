"use client";

import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";

const lift = {
  rest: {
    opacity: 1,
    y: 0,
    scale: 1,
    boxShadow: "0 8px 18px rgba(17, 17, 24, 0.16)",
  },
  hover: {
    opacity: 1,
    y: -4,
    scale: 1,
    boxShadow: "0 16px 32px rgba(17, 17, 24, 0.28)",
  },
  tap: {
    opacity: 1,
    y: -1,
    scale: 0.98,
    boxShadow: "0 6px 14px rgba(17, 17, 24, 0.18)",
  },
};

const sheen = {
  rest: { x: "-140%" },
  hover: { x: "240%", transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

const arrow = {
  rest: { x: 0 },
  hover: { x: 6 },
};

/** 章末占位区里的「进入下一章」入口。样式集中在这里，StudyView 只负责文案和跳转。 */
export function NextChapterButton({ label, onClick }: { label: string; onClick: () => void }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="inline-flex max-w-full rounded-full"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={reduce ? undefined : "rest"}
      whileHover={reduce ? undefined : "hover"}
      whileTap={reduce ? undefined : "tap"}
      variants={reduce ? undefined : lift}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
    >
      <Button
        type="button"
        onClick={onClick}
        className="relative h-11 max-w-full overflow-hidden rounded-full px-6 text-[15px] shadow-none hover:bg-primary hover:shadow-none"
      >
        {reduce ? null : (
          <motion.span
            aria-hidden
            initial={{ x: "-140%" }}
            variants={sheen}
            className="pointer-events-none absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-transparent via-white/40 to-transparent"
          />
        )}
        <span className="relative min-w-0 truncate">进入下一章 · {label}</span>
        <motion.span
          aria-hidden
          className="relative inline-flex"
          initial={{ x: 0 }}
          variants={reduce ? undefined : arrow}
          transition={{ type: "spring", stiffness: 520, damping: 20 }}
        >
          <ArrowRight />
        </motion.span>
      </Button>
    </motion.div>
  );
}
