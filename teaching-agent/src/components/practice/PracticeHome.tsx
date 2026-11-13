"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, RotateCcw, Shuffle } from "lucide-react";
import { KNOWLEDGE_SECTIONS } from "@/lib/sections";
import { linkedCountForK, pickQuestionsForK, pickSmartSet, useMastery } from "@/lib/progress/store";
import { MasteryRing } from "@/components/progress/MasteryRing";

const pad = (k: string) => `K${k.slice(1).padStart(2, "0")}`;
const nameOf = (k: string) => KNOWLEDGE_SECTIONS.find(s => s.id === k)?.name ?? k;

/**
 * 练习首屏：三件事，一眼选一件。
 * 今天练这些（智能组卷）/ 改错题 / 按知识点练。手动设置题型难度作为次要入口。
 */
export function PracticeHome({ wrongCount, onStart, onWrongbook, onLinked, onCustom }: {
  wrongCount: number;
  onStart: (ids: string[]) => void;
  onWrongbook: () => void;
  onLinked: () => void;
  onCustom: () => void;
}) {
  const mastery = useMastery();
  const [seed, setSeed] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const smart = useMemo(() => pickSmartSet(10), [seed, mastery.ready]);
  const startK = (k: string) => {
    const ids = pickQuestionsForK(k, 5);
    if (ids.length) onStart(ids); else if (linkedCountForK(k)) onLinked();
  };

  return (
    <div className="practice-home">
      <motion.button type="button" className="ph-hero" onClick={() => onStart(smart.ids)} whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }} disabled={!smart.ids.length}>
        <span className="ph-kicker">今天练这些</span>
        <span className="ph-title font-serif-cn">{smart.ids.length} 道题，补最薄弱的地方</span>
        <span className="ph-chips">{smart.ks.slice(0, 4).map(k => <span key={k}>{pad(k)} {nameOf(k)}</span>)}</span>
        <span className="ph-cta">开始<ArrowRight /></span>
        <span role="button" tabIndex={0} className="ph-reroll" aria-label="换一组" onClick={e => { e.stopPropagation(); setSeed(s => s + 1); }} onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); setSeed(s => s + 1); } }}><Shuffle className="size-3.5" />换一组</span>
      </motion.button>

      <div className="ph-row">
        <motion.button type="button" className="ph-card" onClick={onWrongbook} whileHover={{ y: -2 }} disabled={!wrongCount}>
          <span className="ph-kicker">改错题</span>
          <span className="ph-big">{wrongCount}</span>
          <span className="ph-sub">{wrongCount ? "道错题待重练" : "还没有错题"}</span>
          <RotateCcw className="ph-icon" />
        </motion.button>
        <motion.button type="button" className="ph-card" onClick={onCustom} whileHover={{ y: -2 }}>
          <span className="ph-kicker">自定义</span>
          <span className="ph-big">题型 · 难度</span>
          <span className="ph-sub">自己挑题量和范围</span>
          <ArrowRight className="ph-icon" />
        </motion.button>
      </div>

      <div className="ph-section">
        <p className="ph-kicker">按知识点练</p>
        <div className="ph-grid">
          {KNOWLEDGE_SECTIONS.map((s, i) => {
            const m = mastery.byK[s.id];
            return (
              <motion.button key={s.id} type="button" className="ph-k" onClick={() => startK(s.id)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                <span className="ph-k-top"><span className="ph-k-code">{pad(s.id)}</span>{m ? <MasteryRing m={m} size={16} /> : null}</span>
                <span className="ph-k-name">{s.name}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
