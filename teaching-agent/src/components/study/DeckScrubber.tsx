"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { appPath } from "@/lib/app-path";

export type ScrubItem = { id: string; kind: "slide" | "quiz" | "lab"; page: number };

/** 本节页码条：每页一个点，看过的实心；悬停出缩略图，点击跳页 */
export function DeckScrubber({ items, index, viewed, onJump, label }: { items: ScrubItem[]; index: number; viewed: Set<number>; onJump: (id: string) => void; label: React.ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? items[hover] : null;
  return (
    <div className="scrubber">
      <span className="scrubber-label">{label}</span>
      <div className="scrubber-track" onMouseLeave={() => setHover(null)}>
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            className="scrubber-dot"
            data-kind={it.kind}
            data-current={i === index || undefined}
            data-seen={(it.kind === "slide" && viewed.has(it.page)) || undefined}
            aria-label={it.kind === "slide" ? `第 ${it.page} 页` : it.kind === "quiz" ? "随堂题" : "配筋率互动"}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => onJump(it.id)}
          >
            {i === index ? <motion.span layoutId="scrub-cur" className="scrubber-cur" transition={{ type: "spring", stiffness: 500, damping: 36 }} /> : null}
          </button>
        ))}
        <AnimatePresence>
          {h && h.kind === "slide" ? (
            <motion.span
              key="thumb"
              className="scrubber-thumb"
              style={{ left: `${((hover! + 0.5) / items.length) * 100}%` }}
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={appPath(`/slides/slide-${String(h.page).padStart(3, "0")}.png`)} alt="" />
              <span>P.{String(h.page).padStart(3, "0")}</span>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
