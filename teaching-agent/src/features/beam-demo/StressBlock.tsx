"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValueEvent, useSpring } from "motion/react";

/**
 * 截面受压区应力图：随加载从三角形（弹性）变成曲线（塑性发展）；
 * 点一下“换成等效矩形”，曲线平滑变形为 α₁f_c × x 的矩形，x = β₁x_c。
 */
const W = 180, H = 200, TOP = 16, LEFT = 46, MAXW = 110;

function profile(depth: number, plastic: number, rect: number, steps = 96) {
  // depth：受压区高度（px）；plastic 0→1：弹性三角 → 抛物线-矩形；rect 0→1：→ 等效矩形
  const pts: [number, number][] = [];
  const xRect = depth * 0.8; // β₁ = 0.8
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 顶面 → 1 中和轴
    const y = TOP + t * depth;
    const strain = 1 - t;
    const elastic = strain;
    const ec0 = 0.002 / 0.0033; // 峰值应变位置
    const curve = strain >= ec0 ? 1 : 1 - Math.pow(1 - strain / ec0, 2);
    const actual = elastic * (1 - plastic) + curve * plastic;
    const rectV = t * depth <= xRect ? 1 : 0;
    pts.push([LEFT + MAXW * (actual * (1 - rect) + rectV * rect), y]);
  }
  return `M${LEFT},${TOP} ` + pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + ` L${LEFT},${(TOP + depth).toFixed(1)} Z`;
}

export function StressBlock({ progress, neutralDepth, crackAt }: { progress: number; neutralDepth: number; crackAt: number }) {
  const [rect, setRect] = useState(false);
  const blend = useSpring(0, { stiffness: 140, damping: 22 });
  const [k, setK] = useState(0);
  useMotionValueEvent(blend, "change", setK);
  useEffect(() => { blend.set(rect ? 1 : 0); }, [rect, blend]);
  const depth = Math.max(26, (H - TOP * 2) * Math.min(0.95, neutralDepth));
  const plastic = progress <= crackAt ? 0 : Math.min(1, (progress - crackAt) / (1 - crackAt) * 1.4);
  return (
    <figure className="stress-block">
      <svg viewBox={`0 0 ${W} ${H}`} aria-label="受压区应力图">
        <line x1={LEFT} y1={TOP - 6} x2={LEFT} y2={H - TOP} className="sb-axis" />
        <line x1={LEFT - 30} y1={TOP + depth} x2={W - 6} y2={TOP + depth} className="sb-na" />
        <motion.path d={profile(depth, plastic, k)} className="sb-fill" />
        <text x={LEFT - 6} y={TOP + depth + 4} className="sb-text" style={{ textAnchor: "end" }}>中和轴</text>
        {k > 0.6 ? (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <text x={LEFT + MAXW / 2} y={TOP - 4} className="sb-text sb-strong" style={{ textAnchor: "middle" }}>α<tspan baselineShift="sub" fontSize="8">1</tspan>f<tspan baselineShift="sub" fontSize="8">c</tspan></text>
            <line x1={LEFT - 16} y1={TOP} x2={LEFT - 16} y2={TOP + depth * 0.8} className="sb-dim" />
            <line x1={LEFT - 20} y1={TOP} x2={LEFT - 12} y2={TOP} className="sb-dim" />
            <line x1={LEFT - 20} y1={TOP + depth * 0.8} x2={LEFT - 12} y2={TOP + depth * 0.8} className="sb-dim" />
            <text x={LEFT - 22} y={TOP + depth * 0.4 + 4} className="sb-text sb-strong" style={{ textAnchor: "end" }}>x</text>
          </motion.g>
        ) : progress > 0 ? <text x={LEFT + MAXW + 6} y={TOP + 12} className="sb-text">σ<tspan baselineShift="sub" fontSize="8">c</tspan></text> : null}
      </svg>
      <button type="button" className="sb-toggle" aria-pressed={rect} onClick={() => setRect(v => !v)} disabled={progress === 0}>
        {rect ? "看实际应力图" : "换成等效矩形"}
      </button>
    </figure>
  );
}
