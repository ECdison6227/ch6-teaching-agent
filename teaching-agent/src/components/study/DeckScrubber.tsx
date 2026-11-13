"use client";

import { useRef, useState, type PointerEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { appPath } from "@/lib/app-path";

export type ScrubItem = { id: string; kind: "slide" | "quiz" | "lab"; page: number };

/** 本节页码条：每页一个点，看过的实心；悬停或按住拖动出缩略图，松手跳到那一页 */
export function DeckScrubber({ items, index, viewed, onJump, label }: { items: ScrubItem[]; index: number; viewed: Set<number>; onJump: (id: string) => void; label: React.ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const h = hover !== null ? items[hover] : null;
  const indexAt = (clientX: number) => {
    const dots = track.current?.querySelectorAll<HTMLElement>(".scrubber-dot");
    if (!dots?.length) return null;
    let best = 0, dist = Infinity;
    dots.forEach((d, i) => { const r = d.getBoundingClientRect(); const c = Math.abs(r.left + r.width / 2 - clientX); if (c < dist) { dist = c; best = i; } });
    return best;
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    track.current?.setPointerCapture(e.pointerId);
    setDrag(true);
    setHover(indexAt(e.clientX));
  };
  const move = (e: PointerEvent<HTMLDivElement>) => { if (drag) setHover(indexAt(e.clientX)); };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDrag(false);
    const i = indexAt(e.clientX);
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    if (e.pointerType !== "mouse") setHover(null);
    if (i !== null && i !== index) onJump(items[i].id);
  };
  return (
    <div className="scrubber">
      <span className="scrubber-label">{label}</span>
      <div
        ref={track} className="scrubber-track" data-drag={drag || undefined}
        onMouseLeave={() => { if (!drag) setHover(null); }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { setDrag(false); setHover(null); }}
      >
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            className="scrubber-dot"
            data-kind={it.kind}
            data-current={i === index || undefined}
            data-seen={(it.kind === "slide" && viewed.has(it.page)) || undefined}
            aria-label={it.kind === "slide" ? `第 ${it.page} 页` : it.kind === "quiz" ? "随堂题" : "配筋率互动"}
            onMouseEnter={() => { if (!drag) setHover(i); }}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => { if (!suppressClick.current) onJump(it.id); }}
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
