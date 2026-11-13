"use client";

import { motion } from "motion/react";
import { ArrowUpRight, Check, TriangleAlert } from "lucide-react";
import type { BeamSingleResult } from "@/lib/beam-types";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fmt = (v: number | null, d = 0) => (v === null ? "—" : v.toLocaleString("zh-CN", { maximumFractionDigits: d, minimumFractionDigits: d }));

const DIAMETERS = [12, 14, 16, 18, 20, 22, 25, 28, 32];
const area = (d: number) => (Math.PI * d * d) / 4;

/**
 * 选筋建议：单排放得下（净距 ≥ max(25, d)）且面积够的组合里，超配最少、根数直径常用的那组。
 * 只是教学建议，排布、锚固、构造仍需按规范核对。
 */
export function suggestBars(asRequired: number, b: number, coverToStirrup: number, stirrup: number) {
  const clear = b - 2 * (coverToStirrup + stirrup);
  let best: { n: number; d: number; as: number; score: number } | null = null;
  for (const d of DIAMETERS) for (let n = 2; n <= 8; n++) {
    const fits = n * d + (n - 1) * Math.max(25, d) <= clear;
    const as = n * area(d);
    if (!fits || as < asRequired) continue;
    // 超配越少越好；梁宽 ≥200 时少于 3 根、直径 >25 的组合不常用，适当加罚
    const score = (as - asRequired) / asRequired + (b >= 200 && n < 3 ? 0.15 : 0) + (d > 25 ? 0.03 : 0) + n * 0.002;
    if (!best || score < best.score) best = { n, d, as, score };
  }
  return best;
}

/** 截面示意：按比例画 b×h、箍筋、受拉钢筋与受压区；钢筋一根根落进去 */
function SectionSketch({ b, h, h0, x, bars, d }: { b: number; h: number; h0: number; x: number | null; bars: number; d: number }) {
  const W = 240, H = 240, pad = 40;
  const s = Math.min((W - pad * 2) / b, (H - pad * 2) / h);
  const bw = b * s, bh = h * s, ox = (W - bw) / 2, oy = (H - bh) / 2;
  const barY = oy + h0 * s;
  const r = Math.max(3, (d / 2) * s);
  const inner = 6;
  const span = bw - 2 * (inner + r + 2);
  const xs = Array.from({ length: bars }, (_, i) => ox + inner + r + 2 + (bars === 1 ? span / 2 : (span * i) / (bars - 1)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="beam-section" aria-label="截面示意">
      <rect x={ox} y={oy} width={bw} height={bh} className="bs-concrete" />
      {x !== null ? <motion.rect x={ox} y={oy} width={bw} initial={{ height: 0 }} animate={{ height: Math.min(bh, x * s) }} transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="bs-comp" /> : null}
      {x !== null ? <motion.line x1={ox - 6} x2={ox + bw + 6} initial={{ y1: oy, y2: oy }} animate={{ y1: oy + Math.min(bh, x * s), y2: oy + Math.min(bh, x * s) }} transition={{ delay: 0.5, duration: 0.7 }} className="bs-na" /> : null}
      <rect x={ox + inner} y={oy + inner} width={bw - inner * 2} height={bh - inner * 2} rx={3} className="bs-stirrup" />
      {xs.map((cx, i) => (
        <motion.circle key={i} cx={cx} r={r} className="bs-bar" initial={{ cy: oy - 20, opacity: 0 }} animate={{ cy: barY, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.15 + i * 0.08 }} />
      ))}
      <g className="bs-dim">
        <line x1={ox} y1={oy + bh + 12} x2={ox + bw} y2={oy + bh + 12} /><text x={ox + bw / 2} y={oy + bh + 24}>b = {fmt(b)}</text>
        <line x1={ox + bw + 12} y1={oy} x2={ox + bw + 12} y2={oy + bh} /><text x={ox + bw + 16} y={oy + bh / 2} style={{ textAnchor: "start" }}>h = {fmt(h)}</text>
        {x !== null ? <text x={ox - 8} y={oy + Math.min(bh, x * s) / 2 + 4} style={{ textAnchor: "end" }}>x</text> : null}
      </g>
    </svg>
  );
}

/** ξ 仪表：0 ~ 0.7，ξ_b 处是适筋/超筋分界 */
function XiGauge({ xi, xib, low }: { xi: number; xib: number; low: boolean }) {
  const max = 0.7;
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const state = low ? "少筋" : xi <= xib ? "适筋" : "超筋";
  return (
    <div className="xi-gauge">
      <div className="xi-track">
        <span className="xi-zone xi-ok" style={{ width: pos(xib) }} />
        <span className="xi-zone xi-over" style={{ left: pos(xib), right: 0 }} />
        <span className="xi-b" style={{ left: pos(xib) }}><i>ξ<sub>b</sub> {xib.toFixed(3)}</i></span>
        <motion.span className="xi-needle" initial={{ left: "0%" }} animate={{ left: pos(xi) }} transition={{ type: "spring", stiffness: 120, damping: 14, delay: 0.4 }}><i>ξ {xi.toFixed(3)}</i></motion.span>
      </div>
      <p className="xi-state" data-state={state}>{state === "适筋" ? <Check className="size-4" /> : <TriangleAlert className="size-4" />}{state}</p>
    </div>
  );
}

/** 单筋结果的结论卡：先给答案，再给依据 */
export function BeamConclusion({ result, onSlides }: { result: BeamSingleResult; onSlides: () => void }) {
  const ref = result.reference;
  const b = num(ref.b_mm) ?? num(result.inputs.b_mm) ?? 0;
  const h = num(ref.h_mm) ?? num(result.inputs.h_mm) ?? 0;
  const h0 = num(ref.h0_mm) ?? result.geometry.h0_mm;
  const xib = num(ref.xi_b);
  const design = result.task === "design";
  const asReq = num(ref.As_required_mm2);
  const xi = design ? num(ref.xi_required) : num(ref.xi_yield_assumed);
  const x = design ? num(ref.x_required_mm) : num(ref.x_yield_assumed_mm);
  const asMin = num(ref.As_min_mm2);
  const asGiven = num(ref.As_given_mm2);
  const geo = result.geometry as Record<string, unknown>;
  const pick = design && asReq !== null ? suggestBars(asReq, b, num(geo.cover_to_stirrup_mm) ?? 20, num(geo.stirrup_d_mm) ?? 8) : null;
  const barsForSketch = pick ?? (asGiven ? { n: Math.max(2, Math.round(asGiven / area(20))), d: 20, as: asGiven } : { n: 3, d: 20, as: 0 });
  const mu = num(ref.Mu_reference_kNm), m = num(ref.M_design_kNm) ?? num(result.inputs.M_design_kNm);
  const low = design ? false : asGiven !== null && asMin !== null && asGiven < asMin;
  const model = result.prediction?.value ?? null;
  const err = result.comparison?.relative_error_percent ?? null;

  return (
    <motion.section className="beam-conclusion" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="bc-main">
        <p className="bc-kicker">{design ? "需要的受拉钢筋" : "受弯承载力"}</p>
        {design ? (
          <p className="bc-big">A<sub>s</sub> = {fmt(asReq)} <span>mm²</span></p>
        ) : (
          <p className="bc-big">M<sub>u</sub> = {fmt(mu, 1)} <span>kN·m</span></p>
        )}
        {design && pick ? (
          <p className="bc-pick">建议配 <b>{pick.n} ⌀ {pick.d}</b>　实配 {fmt(pick.as)} mm²</p>
        ) : !design && m !== null && mu !== null ? (
          <p className="bc-pick" data-ok={mu >= m || undefined}>{mu >= m ? "满足" : "不满足"}　M = {fmt(m, 1)} kN·m</p>
        ) : null}
        {xi !== null && xib !== null ? <XiGauge xi={xi} xib={xib} low={low} /> : null}
        {model !== null && err !== null ? (
          <p className="bc-model">AI 校核 {fmt(model, design ? 0 : 1)} {result.prediction?.unit}　{Math.abs(err) <= 2 ? "✓ 一致" : `相差 ${err.toFixed(1)}%`}</p>
        ) : null}
        <button type="button" className="bc-slides" onClick={onSlides}>对应课件：K05 单筋矩形截面计算<ArrowUpRight className="size-3.5" /></button>
      </div>
      <SectionSketch b={b} h={h} h0={h0} x={x} bars={barsForSketch.n} d={barsForSketch.d} />
    </motion.section>
  );
}
