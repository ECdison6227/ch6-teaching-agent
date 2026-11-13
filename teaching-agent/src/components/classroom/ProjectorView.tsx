"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import type { TeacherRound, TeacherSnapshot } from "@/lib/classroom/types";

const optionsOf = (r: TeacherRound) => (r.question.type === "judge" ? [{ id: "T", text: "正确" }, { id: "F", text: "错误" }] : r.question.options);

/**
 * 投影模式：黑底白字，教室后排也看得清。
 * 没有题时展示大号课堂码 + 二维码 + 实时人数；发题后展示题目、作答进度和选项分布（公布前不标对错）。
 */
export function ProjectorView({ state, round, qrSvg, onClose }: { state: TeacherSnapshot; round: TeacherRound | null; qrSvg: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const total = state.participants.length;
  const c = state.classroom;

  useEffect(() => {
    const el = ref.current;
    void el?.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onFs = () => { if (!document.fullscreenElement) onClose(); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  const showRound = round && c.status === "active";
  return (
    <motion.div ref={ref} className="projector" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" className="projector-close" aria-label="退出投影" onClick={onClose}><X /></button>
      <div className="projector-top">
        <span className="font-serif-cn">{c.title}</span>
        <span className="projector-count"><motion.b key={total} initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{total}</motion.b> 人在课堂</span>
      </div>
      <AnimatePresence mode="wait">
        {!showRound ? (
          <motion.div key="invite" className="projector-invite" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <div>
              <p className="projector-label">课堂码</p>
              <p className="projector-code">{c.code.slice(0, 3)}<span />{c.code.slice(3)}</p>
              <p className="projector-hint">打开 {typeof window === "undefined" ? "" : window.location.host}/classroom 输入课堂码，或扫右侧二维码</p>
            </div>
            {qrSvg ? <img className="projector-qr" alt="入课二维码" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`} /> : null}
          </motion.div>
        ) : (
          <motion.div key={round.id} className="projector-round" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ type: "spring", stiffness: 220, damping: 26 }}>
            <p className="projector-label">第 {round.sequence} 题 · {round.status === "open" ? "作答中" : round.status === "closed" ? "已收题" : "答案公布"}</p>
            <Markdown text={round.question.prompt} className="projector-prompt" />
            {round.question.type !== "fill" ? (
              <div className="projector-bars">
                {optionsOf(round).map(o => {
                  const n = round.stats.distribution[o.id] ?? 0;
                  const correct = round.status === "revealed" && (round.answer ?? "").toUpperCase().includes(o.id);
                  return (
                    <div key={o.id} className="projector-bar" data-correct={correct || undefined}>
                      <motion.span className="projector-fill" initial={false} animate={{ width: `${total ? (n / total) * 100 : 0}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
                      <span className="projector-key">{o.id}</span>
                      <Markdown text={o.text} className="md-inline min-w-0 flex-1" />
                      <span className="projector-n">{n}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div className="projector-progress">
              <span>已答 <b>{round.stats.submitted}</b> / {total}</span>
              <span className="projector-track"><motion.span initial={false} animate={{ scaleX: total ? round.stats.submitted / total : 0 }} /></span>
            </div>
            {round.status === "revealed" ? <p className="projector-answer">答案 {round.answer}</p> : null}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
