"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from "motion/react";
import { RotateCcw } from "lucide-react";
import { useHydratedReducedMotion } from "@/hooks/use-hydrated-reduced-motion";

/**
 * 简支梁三分点加载：适筋梁从加载到破坏的三个阶段。
 * 一根进度线 t ∈ [0, 1] 驱动所有图元，便于重播、减少动态效果时直接跳到终态。
 */
const W = 960;
const L = 110; // 左支座
const R = 850; // 右支座
const P1 = 357; // 三分点
const P2 = 603;
const TOP = 118;
const BOT = 170;
const MBASE = 250; // 弯矩图基线
const DIM = 214; // 跨度标注线
const DURATION = 7.2;

const STAGES = [
  { at: 0.08, code: "Ⅰ", name: "弹性阶段" },
  { at: 0.36, code: "Ⅱ", name: "带裂缝工作" },
  { at: 0.66, code: "Ⅲ", name: "破坏阶段" },
] as const;

/** 跨中挠度（px）随进度：弹性段很小，开裂后变陡，屈服后急增 */
const DEFLECT_T = [0, 0.08, 0.36, 0.66, 0.92, 1];
const DEFLECT_V = [0, 0, 2.5, 7, 15, 16];

/** 梁轴线上任一点的挠度：用正弦形近似，支座处为 0 */
function sag(x: number, d: number) {
  return d * Math.sin((Math.PI * (x - L)) / (R - L));
}

function beamPath(d: number, y: number) {
  const pts: string[] = [];
  for (let x = 80; x <= 880; x += 20) {
    const inside = Math.min(Math.max(x, L), R);
    // 梁端外伸段按支座处转角直线延伸，体现梁端转动
    const slope = (d * Math.PI) / (R - L);
    const yy = x < L ? y - slope * (L - x) : x > R ? y - slope * (x - R) : y + sag(inside, d);
    pts.push(`${x},${yy.toFixed(2)}`);
  }
  return pts;
}

function useDraw(t: MotionValue<number>, from: number, to: number) {
  return useTransform(t, [from, to], [0, 1], { clamp: true });
}

function Crack({ t, from, d, x, deflect }: { t: MotionValue<number>; from: number; d: string; x: number; deflect: MotionValue<number> }) {
  const pathLength = useDraw(t, from, from + 0.1);
  const opacity = useTransform(t, [from, from + 0.02], [0, 1]);
  const y = useTransform(deflect, v => sag(x, v));
  return <motion.path d={d} style={{ pathLength, opacity, y }} className="beam-crack" />;
}

export function BeamHero({ active }: { active: boolean }) {
  const reduce = useHydratedReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const t = useMotionValue(0);
  const [stage, setStage] = useState(-1);
  const ratio = useTransform(t, [0.08, 0.92], [0, 1], { clamp: true });
  const ratioText = useRef<HTMLSpanElement>(null);
  const [run, setRun] = useState(0);
  const played = useRef(false);

  useEffect(() => {
    if (!active || !inView) return;
    if (played.current && run === 0) return;
    played.current = true;
    if (reduce) { t.set(1); return; }
    t.set(0);
    const controls = animate(t, 1, { duration: DURATION, ease: "linear", delay: 0.35 });
    return () => controls.stop();
  }, [active, inView, run, reduce, t]);

  useMotionValueEvent(t, "change", v => {
    let s = -1;
    STAGES.forEach((st, i) => { if (v >= st.at) s = i; });
    setStage(s);
    if (ratioText.current) ratioText.current.textContent = ratio.get().toFixed(2);
  });

  const deflect = useTransform(t, DEFLECT_T, DEFLECT_V);
  const top = useTransform(deflect, d => beamPath(d, TOP));
  const bottom = useTransform(deflect, d => beamPath(d, BOT));
  const outline = useTransform([top, bottom] as MotionValue[], ([a, b]: string[][]) => `M${a.join(" L")} L${[...b].reverse().join(" L")} Z`);
  const rebar = useTransform(deflect, d => `M${beamPath(d, BOT - 9).join(" L")}`);
  const rebarTop = useTransform(deflect, d => `M${beamPath(d, TOP + 9).join(" L")}`);

  // 荷载：落下 → 随梁下挠
  const loadDrop = useTransform(t, [0, 0.07], [-26, 0], { clamp: true });
  const loadOpacity = useTransform(t, [0, 0.04], [0, 1]);
  const loadY = useTransform([loadDrop, deflect] as MotionValue[], ([a, d]: number[]) => a + sag(P1, d));

  // 弯矩图：三分点加载为梯形，高度 ∝ 荷载
  const mh = useTransform(t, [0.06, 0.92], [0, 58], { clamp: true });
  const mPath = useTransform(mh, h => `M${L},${MBASE} L${P1},${MBASE + h} L${P2},${MBASE + h} L${R},${MBASE} Z`);
  const mOpacity = useTransform(t, [0.06, 0.12], [0, 1]);
  const mLabelY = useTransform(mh, h => MBASE + h + 20);

  // 受压区混凝土压碎
  const crush = useTransform(t, [0.86, 0.94], [0, 1], { clamp: true });
  const crushY = useTransform(deflect, d => d * 0.95);

  const flexural = [420, 455, 480, 505, 540, 395, 565];
  const stirrups = Array.from({ length: 19 }, (_, i) => L + 18 + i * 39);

  return (
    <figure className="beam-hero">
      <div className="beam-hero-head">
        <div className="flex items-baseline gap-3">
          <span className="beam-stage-code">{stage >= 0 ? STAGES[stage].code : "—"}</span>
          <motion.span key={stage} className="beam-stage-name" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            {stage >= 0 ? STAGES[stage].name : "等待加载"}
          </motion.span>
        </div>
        <div className="beam-ratio" aria-hidden>
          <span>P / P<sub>u</sub></span>
          <span className="beam-ratio-track"><motion.span style={{ scaleX: ratio }} /></span>
          <span ref={ratioText} className="tabular-nums">0.00</span>
        </div>
      </div>

      <svg ref={ref} viewBox={`0 0 ${W} 336`} className="beam-hero-svg" role="img" aria-label="简支梁三分点加载：弹性阶段、带裂缝工作阶段、破坏阶段，以及对应的弯矩图">
        <defs>
          <pattern id="beam-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="currentColor" strokeWidth="1" opacity="0.22" />
          </pattern>
          <pattern id="beam-aggregate" width="26" height="22" patternUnits="userSpaceOnUse">
            <circle cx="5" cy="6" r="1.1" fill="currentColor" opacity="0.18" />
            <circle cx="17" cy="15" r="0.9" fill="currentColor" opacity="0.14" />
            <circle cx="21" cy="4" r="0.6" fill="currentColor" opacity="0.16" />
            <path d="M10 17 l2 -1.5 l1.6 1.8 z" fill="currentColor" opacity="0.12" />
          </pattern>
        </defs>

        {/* 跨度标注 */}
        <g className="beam-dim">
          <line x1={L} y1={DIM} x2={R} y2={DIM} />
          {[L, P1, P2, R].map(x => <line key={x} x1={x - 4} y1={DIM + 4} x2={x + 4} y2={DIM - 4} />)}
          <text x={(L + P1) / 2} y={DIM - 6}>a</text>
          <text x={(P1 + P2) / 2} y={DIM - 6}>a</text>
          <text x={(P2 + R) / 2} y={DIM - 6}>a</text>
          <text x={R + 16} y={DIM + 4} style={{ textAnchor: "start" }}>l₀ = 3a</text>
        </g>

        {/* 弯矩图 */}
        <motion.g style={{ opacity: mOpacity }}>
          <line x1={L - 20} y1={MBASE} x2={R + 20} y2={MBASE} className="beam-axis" />
          <motion.path d={mPath} fill="url(#beam-hatch)" className="beam-moment" />
          <motion.text x={(P1 + P2) / 2} y={mLabelY} className="beam-label" textAnchor="middle">M = Pa</motion.text>
          <text x={R + 26} y={MBASE + 4} className="beam-label">M</text>
        </motion.g>

        {/* 梁 */}
        <motion.path d={outline} className="beam-body" />
        <motion.path d={outline} fill="url(#beam-aggregate)" stroke="none" />
        <g className="beam-stirrups">
          {stirrups.map(x => (
            <StirrupLine key={x} x={x} deflect={deflect} />
          ))}
        </g>
        <motion.path d={rebarTop} className="beam-rebar beam-rebar-top" />
        <motion.path d={rebar} className="beam-rebar" />

        {/* 正截面裂缝（纯弯段，竖向） */}
        {flexural.map((x, i) => (
          <Crack key={x} x={x} t={t} deflect={deflect} from={0.36 + i * 0.035} d={`M${x},${BOT} L${x + (i % 2 ? 2 : -2)},${BOT - 18 - (i % 3) * 6} L${x + (i % 2 ? -1 : 1)},${BOT - 28 - (i % 3) * 7}`} />
        ))}
        {/* 斜裂缝（剪跨段） */}
        <Crack x={L + 108} t={t} deflect={deflect} from={0.6} d={`M${L + 70},${BOT} L${L + 104},${BOT - 18} L${L + 146},${BOT - 40}`} />
        <Crack x={R - 108} t={t} deflect={deflect} from={0.63} d={`M${R - 70},${BOT} L${R - 104},${BOT - 18} L${R - 146},${BOT - 40}`} />
        <Crack x={L + 175} t={t} deflect={deflect} from={0.7} d={`M${L + 120},${BOT} L${L + 168},${BOT - 26} L${P1 - 20},${BOT - 44}`} />

        {/* 受压区压碎 */}
        <motion.g style={{ opacity: crush, y: crushY }}>
          {[455, 470, 485, 500, 515].map((x, i) => (
            <path key={x} d={`M${x},${TOP + 2} l${i % 2 ? 5 : -5},7 l${i % 2 ? -3 : 3},5`} className="beam-crack" />
          ))}
        </motion.g>

        {/* 支座 */}
        <g className="beam-support">
          <path d={`M${L},${BOT} l-13,22 h26 z`} />
          <line x1={L - 22} y1={BOT + 22} x2={L + 22} y2={BOT + 22} />
          <path d={`M${R},${BOT} l-13,18 h26 z`} />
          <circle cx={R - 7} cy={BOT + 22} r={3.5} /><circle cx={R + 7} cy={BOT + 22} r={3.5} />
          <line x1={R - 22} y1={BOT + 26.5} x2={R + 22} y2={BOT + 26.5} />
        </g>

        {/* 荷载 */}
        <motion.g style={{ opacity: loadOpacity, y: loadY }} className="beam-load">
          {[P1, P2].map(x => (
            <g key={x}>
              <line x1={x} y1={TOP - 58} x2={x} y2={TOP - 6} />
              <path d={`M${x},${TOP - 2} l-6,-12 h12 z`} />
              <text x={x + 10} y={TOP - 44}>P</text>
            </g>
          ))}
        </motion.g>
      </svg>

      <figcaption className="beam-hero-foot">
        <span>图 6-1　适筋梁三分点加载</span>
        <button type="button" onClick={() => setRun(r => r + 1)} className="beam-replay" aria-label="重播加载过程">
          <RotateCcw className="size-3.5" />重播
        </button>
      </figcaption>
    </figure>
  );
}

function StirrupLine({ x, deflect }: { x: number; deflect: MotionValue<number> }) {
  const y = useTransform(deflect, d => sag(x, d));
  return <motion.line x1={x} y1={TOP + 5} x2={x} y2={BOT - 5} style={{ y }} />;
}
