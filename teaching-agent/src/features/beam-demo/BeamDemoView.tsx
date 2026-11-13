"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { animate } from "motion/react";
import { Pause, Play, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydratedReducedMotion } from "@/hooks/use-hydrated-reduced-motion";
import { beamStore } from "./store";
import SectionExplorationView from "./SectionExplorationView";
import { explorationStore, type ExplorationState } from "./exploration-store";
import {
  STIRRUP_XS, beamOutline, beamY, casesForKind, clampProgress, compressionOutline, concreteSpeckles,
  crackWedgePath, getBeamCase, getBeamFrame, sectionCrackWedgePath, steelPath,
  type BeamCase, type CaseId, type DiagramView,
} from "./model";

const serverSnapshot = beamStore.getSnapshot();
const explorationServerSnapshot = explorationStore.getSnapshot();
const INK = "hsl(var(--foreground))";
const ACCENT = "var(--kimi-accent)";
const DAMAGE = "hsl(var(--destructive))";
/** 示意图用的混凝土/钢筋色，与主题 ink 解耦，贴近线上手改版。 */
const STONE = "#78716c";
const STONE_DARK = "#57534e";
const STONE_EDGE = "#8f8a84";
const STONE_SOFT = "#a8a29e";
const CRACK_FILL = "#3f3a36";
const LOAD_INK = "#292524";
const SUPPORT_FILL = "#e7e5e4";
type Frame = ReturnType<typeof getBeamFrame>;

function crackStations(caseId: CaseId) {
  if (caseId === "single-low") return [300];
  if (caseId === "single-high") return [218, 246, 274, 302, 330, 358, 386];
  return [222, 252, 282, 312, 342, 372];
}

function staggeredCrackExtent(extent: number, index: number) {
  return Math.min(1, Math.max(0, (extent - .09 * index) / (1 - .09 * index)));
}

/** 业务示意图：SVG用于连续变形和应变分布，交互控件仍使用既有组件。 */
function BeamFigure({ scenario, frame, view }: { scenario: BeamCase; frame: Frame; view: DiagramView }) {
  const clipId = "beam-shape-" + scenario.id;
  const concreteGradientId = "cg-" + scenario.id;
  const hatchId = "ht-" + scenario.id;
  const sectionGradientId = "cgs-" + scenario.id;
  const steelGradientId = "sg-" + scenario.id;
  const tensionColor = frame.tensionYielded ? ACCENT : STONE_DARK;
  const compressionColor = frame.compressionYielded ? ACCENT : STONE_DARK;
  const cracks = crackStations(scenario.id);
  const neutralY = 42 + frame.neutralDepth * 210;
  const strainX = (depth: number) => 400 + frame.progress * 140 * (depth - frame.neutralDepth);
  const barWidth = scenario.id === "single-low" ? 3.5 : scenario.id === "single-high" ? 8 : 5.5;
  const loadOpacity = Math.min(1, 2.5 * frame.progress);
  const beamSpeckles = concreteSpeckles(7, 26, 70, 116, 460, 60);
  const sectionSpeckles = concreteSpeckles(13, 30, 88, 50, 114, 194);
  return <svg viewBox="0 0 600 290" className="mx-auto block w-full max-w-2xl" role="img"
    aria-label={(scenario.kind === "single" ? "单筋梁" : "双筋梁") + "，" + scenario.label + "，" + frame.stage.label + (view === "beam" ? "，梁的变形示意" : "，截面与线性应变分布示意")}>
    <title>{scenario.label} · {frame.stage.label}</title>
    {view === "beam" ? <>
      <defs>
        <clipPath id={clipId}><path d={beamOutline(frame.sag)} /></clipPath>
        <linearGradient id={concreteGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f5f4f2" /><stop offset="1" stopColor="#e3e1dd" />
        </linearGradient>
        <pattern id={hatchId} width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="7" stroke={STONE} strokeWidth="1.2" opacity=".55" />
        </pattern>
      </defs>
      {frame.progress > 0 ? <path d={beamOutline(0)} fill="none" stroke={STONE_SOFT} strokeDasharray="5 5" strokeOpacity=".6" strokeWidth="1" /> : null}
      <path d={beamOutline(frame.sag)} fill={"url(#" + concreteGradientId + ")"} stroke={STONE_EDGE} strokeWidth="1.5" />
      {frame.progress > 0 ? <path d={compressionOutline(frame.sag, frame.neutralDepth)} fill={"url(#" + hatchId + ")"} opacity={.12 + .3 * loadOpacity} /> : null}
      <g clipPath={"url(#" + clipId + ")"}>
        {beamSpeckles.map((dot, index) => <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill={STONE} opacity=".16" />)}
        {STIRRUP_XS.map(x => <line key={x} x1={x} y1={beamY(x, .06, frame.sag)} x2={x} y2={beamY(x, .94, frame.sag)}
          stroke={STONE} strokeWidth="2" strokeLinecap="round" opacity=".15" />)}
        {frame.crackExtent > 0 ? cracks.map((x, index) => {
          const extent = staggeredCrackExtent(frame.crackExtent, index);
          const path = crackWedgePath(x, extent, frame.neutralDepth, frame.sag, frame.crackWidth * (scenario.id === "single-low" ? 2.2 : 1), scenario.id === "single-low" ? .15 : 0);
          return path ? <path key={x} d={path} fill={CRACK_FILL} opacity=".92" /> : null;
        }) : null}
        {frame.damage > 0 ? <g opacity={frame.damage}>
          <path d={"M268 " + beamY(268, 0, frame.sag) + " l11 7 l11 -7 l11 7 l11 -7 l11 7 l11 -7"} fill="none" stroke="#44403c" strokeWidth="2.5" strokeLinejoin="round" />
          {[-20, 0, 20].map(offset => <path key={offset} d={"M" + (300 + offset - 8) + " " + beamY(300, 0, frame.sag) + " l16 12 m-16 0 l16 -12"} stroke={DAMAGE} strokeWidth="3" fill="none" />)}
        </g> : null}
        {frame.tensionYielded ? <path d={steelPath(.85, frame.sag, true)} fill="none" stroke={ACCENT} strokeWidth={barWidth + 4.5} strokeLinecap="round" opacity=".3" /> : null}
        <path d={steelPath(.85, frame.sag, true)} fill="none" stroke={tensionColor} strokeWidth={barWidth} strokeLinecap="round" />
        {scenario.kind === "double" ? <>
          {frame.compressionYielded ? <path d={steelPath(.15, frame.sag)} fill="none" stroke={ACCENT} strokeWidth="9" strokeLinecap="round" opacity=".3" /> : null}
          <path d={steelPath(.15, frame.sag)} fill="none" stroke={compressionColor} strokeWidth="4.5" strokeLinecap="round" />
        </> : null}
        {frame.progress > 0 ? <path d={steelPath(frame.neutralDepth, frame.sag)} fill="none" stroke={STONE} strokeOpacity=".8" strokeWidth="1.2" strokeDasharray="6 5" /> : null}
      </g>
      {frame.progress > 0 ? <text x="54" y={beamY(62, frame.neutralDepth, frame.sag) + 4} textAnchor="end" fill={STONE} fontSize="14">中和轴</text> : null}
      <g stroke={STONE_DARK} fill="none" strokeWidth="1.6">
        <path d="M62 182 L47 205 L77 205 Z" fill={SUPPORT_FILL} />
        <path d="M36 211 H88" />
        {[42, 50, 58, 66, 74, 82].map(x => <path key={x} d={"M" + x + " 211 l-6 8"} />)}
        <path d="M538 182 L523 205 L553 205 Z" fill={SUPPORT_FILL} />
        <circle cx="530" cy="211" r="4" fill="#fafaf9" />
        <circle cx="546" cy="211" r="4" fill="#fafaf9" />
        <path d="M508 218 H568" />
        {[514, 522, 530, 538, 546, 554, 562].map(x => <path key={x} d={"M" + x + " 218 l-6 8"} />)}
      </g>
      <g opacity={.25 + .7 * loadOpacity}>
        {([[205, "P"], [395, "P"]] as const).map(([x, label]) => {
          const topY = beamY(x, 0, frame.sag);
          return <g key={x}>
            <rect x={x - 15} y={topY - 5.5} width="30" height="5.5" rx="1.5" fill="#44403c" />
            <path d={"M" + x + " 50 V" + (topY - 9)} stroke={LOAD_INK} strokeWidth="2.5" fill="none" />
            <path d={"M" + (x - 6) + " " + (topY - 17) + " L" + x + " " + (topY - 7) + " L" + (x + 6) + " " + (topY - 17) + " Z"} fill={LOAD_INK} />
            <text x={x + 12} y="64" fill={LOAD_INK} fontSize="16" fontStyle="italic">{label}</text>
          </g>;
        })}
      </g>
      <text x="300" y="26" textAnchor="middle" fill={INK} className="text-[24px] sm:text-[17px]">向下加载</text>
      <text x="300" y="278" textAnchor="middle" fill={INK} opacity=".55" className="text-[24px] sm:text-[15px]">上缘受压 · 下缘受拉</text>
    </> : <>
      <defs>
        <linearGradient id={sectionGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f5f4f2" /><stop offset="1" stopColor="#e3e1dd" />
        </linearGradient>
        <radialGradient id={steelGradientId} cx=".35" cy=".35" r=".85">
          <stop offset="0" stopColor="#e7e5e4" /><stop offset=".5" stopColor="#a8a29e" /><stop offset="1" stopColor="#57534e" />
        </radialGradient>
      </defs>
      <text x="145" y="26" textAnchor="middle" fill={INK} className="text-[24px] sm:text-[18px]">截面</text>
      <text x="400" y="26" textAnchor="middle" fill={INK} className="text-[24px] sm:text-[18px]">应变</text>
      <rect x="80" y="42" width="130" height="210" rx="3" fill={"url(#" + sectionGradientId + ")"} stroke={STONE_EDGE} strokeWidth="1.5" />
      {sectionSpeckles.map((dot, index) => <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill={STONE} opacity=".15" />)}
      <rect x="92" y="54" width="106" height="186" rx="10" fill="none" stroke={STONE} strokeWidth="2" opacity=".7" />
      {frame.progress > 0 ? <rect x="80" y="42" width="130" height={frame.neutralDepth * 210} fill={STONE} opacity={.08 + .1 * loadOpacity} /> : null}
      {frame.progress > 0 ? <path d={"M60 " + neutralY + " H400"} stroke={STONE} strokeOpacity=".5" strokeDasharray="6 5" /> : null}
      {frame.progress > 0 ? <text x="244" y={neutralY - 6} fill={STONE} fontSize="14">中和轴</text> : null}
      {Array.from({ length: scenario.bars }, (_, index) => {
        const x = 100 + 90 * index / Math.max(1, scenario.bars - 1);
        const radius = scenario.id === "single-low" ? 5.5 : 7.5;
        return <g key={index}>
          {frame.tensionYielded ? <circle cx={x} cy={220.5} r={1.9 * radius} fill={ACCENT} opacity=".3" /> : null}
          <circle cx={x} cy={220.5} r={radius} fill={frame.tensionYielded ? ACCENT : "url(#" + steelGradientId + ")"} stroke={frame.tensionYielded ? ACCENT : STONE_DARK} strokeWidth="1" />
        </g>;
      })}
      {scenario.kind === "double" ? <>{[107, 183].map(x => <g key={x}>
        {frame.compressionYielded ? <circle cx={x} cy={74} r="13" fill={ACCENT} opacity=".3" /> : null}
        <circle cx={x} cy={74} r="7" fill={frame.compressionYielded ? ACCENT : "url(#" + steelGradientId + ")"} stroke={frame.compressionYielded ? ACCENT : STONE_DARK} strokeWidth="1" />
      </g>)}</> : null}
      {frame.crackExtent > 0 ? <g>{[125, 165].map(x => {
        const path = sectionCrackWedgePath(x, frame.crackExtent, neutralY, frame.crackWidth);
        return path ? <path key={x} d={path} fill={CRACK_FILL} opacity=".92" /> : null;
      })}</g> : null}
      {frame.damage > 0 ? <g opacity={frame.damage}>
        <path d="M86 46 l12 7 l12 -7 l12 7 l12 -7 l12 7 l12 -7 l12 7 l12 -7" fill="none" stroke="#44403c" strokeWidth="2" strokeLinejoin="round" />
        {[100, 125, 150, 175].map(x => <path key={x} d={"M" + x + " 43 l13 13 m-13 0 l13 -13"} stroke={DAMAGE} strokeWidth="3" fill="none" />)}
      </g> : null}
      <path d="M68 42 V252 M62 42 h12 M62 252 h12" fill="none" stroke={STONE} strokeOpacity=".7" strokeWidth="1" />
      <text x="56" y="150" textAnchor="end" fill={STONE} fontSize="14" fontStyle="italic">h</text>
      <path d="M222 42 V220.5 M216 42 h12 M216 220.5 h12" fill="none" stroke={STONE} strokeOpacity=".7" strokeWidth="1" />
      <text x="228" y="36" fill={STONE} fontSize="14">h₀</text>
      <path d="M80 262 H210 M80 256 v12 M210 256 v12" fill="none" stroke={STONE} strokeOpacity=".7" strokeWidth="1" />
      <text x="145" y="278" textAnchor="middle" fill={STONE} fontSize="14" fontStyle="italic">b</text>
      <path d="M400 40 V257 M290 252 H515" stroke={INK} strokeOpacity=".35" strokeWidth="1" />
      {frame.progress > .02 ? <path d={"M400 42 L" + strainX(0) + " 42 L400 " + neutralY + " Z"} fill="#dc2626" opacity=".12" /> : null}
      {frame.progress > .02 ? <path d={"M400 " + neutralY + " L400 252 L" + strainX(1) + " 252 Z"} fill="#2563eb" opacity=".12" /> : null}
      <path d={"M" + strainX(0) + " 42 L" + strainX(1) + " 252"} fill="none" stroke={LOAD_INK} strokeWidth="2.5" />
      {frame.progress > .02 ? <text x={strainX(0) - 8} y="52" textAnchor="end" fill={frame.concreteCrushed ? DAMAGE : LOAD_INK} fontSize="15">{frame.concreteCrushed ? "ε꜀=εcu" : "ε꜀"}</text> : null}
      {frame.progress > .02 ? <text x={strainX(1) + 8} y="244" fill={frame.tensionYielded ? ACCENT : LOAD_INK} fontSize="15">{frame.tensionYielded ? "εₛ≥εy" : "εₛ"}</text> : null}
      <circle cx={strainX(.85)} cy={220.5} r="6" fill={tensionColor} />
      {scenario.kind === "double" ? <circle cx={strainX(.15)} cy={73.5} r="6" fill={compressionColor} /> : null}
      <text x="400" y="279" textAnchor="middle" fill={INK} opacity=".6" className="text-[24px] sm:text-[15px]">左侧受压 · 右侧受拉</text>
    </>}
  </svg>;
}

export default function BeamDemoView() {
  const saved = useSyncExternalStore(beamStore.subscribe, beamStore.getSnapshot, () => serverSnapshot);
  const exploration = useSyncExternalStore(explorationStore.subscribe, explorationStore.getSnapshot, () => explorationServerSnapshot);
  const scenario = getBeamCase(saved.value.caseId);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [runId, setRunId] = useState(0);
  const progressRef = useRef(0);
  const caseRef = useRef<CaseId>(saved.value.caseId);
  const generation = useRef(0);
  const controls = useRef<{ stop(): void } | null>(null);
  const hydrated = useRef(false);
  const playingRef = useRef(false);
  const reduced = useHydratedReducedMotion();
  const frame = getBeamFrame(scenario.id, progress);
  const setFrameProgress = (value: number) => { progressRef.current = clampProgress(value); setProgress(progressRef.current); };
  const checkpoint = (value: number) => {
    const id = caseRef.current;
    if (hydrated.current) void beamStore.update(previous => previous.caseId === id ? { ...previous, progress: clampProgress(value) } : previous);
  };
  const stop = (save = true) => {
    generation.current++; controls.current?.stop(); controls.current = null;
    playingRef.current = false; setPlaying(false);
    if (save) checkpoint(progressRef.current);
  };
  const seek = (value: number) => { stop(false); setFrameProgress(value); checkpoint(value); };
  const selectCase = (id: CaseId) => {
    stop(false); caseRef.current = id; setFrameProgress(0);
    void beamStore.update(previous => ({ ...previous, caseId: id, progress: 0 }));
  };
  const play = () => {
    if (reduced || !saved.writable) return;
    if (progressRef.current >= 1) setFrameProgress(0);
    generation.current++; playingRef.current = true; setRunId(value => value + 1); setPlaying(true);
  };
  useEffect(() => { void beamStore.initialize(); }, []);
  useEffect(() => { void explorationStore.initialize(); }, []);
  useEffect(() => {
    if (saved.ready && saved.writable && !playingRef.current) {
      caseRef.current = saved.value.caseId;
      setFrameProgress(saved.value.progress); hydrated.current = true;
    }
  }, [saved.ready, saved.writable, saved.value.caseId, saved.value.progress]);
  useEffect(() => { if (exploration.value.panel !== "animation") stop(); }, [exploration.value.panel]);
  useEffect(() => {
    if (!playing || reduced) return;
    const token = ++generation.current;
    const control = animate(progressRef.current, 1, {
      duration: scenario.duration * (1 - progressRef.current), ease: "linear",
      onUpdate: value => { if (generation.current === token) setFrameProgress(value); },
      onComplete: () => {
        if (generation.current !== token) return;
        setFrameProgress(1); playingRef.current = false; setPlaying(false); checkpoint(1);
      },
    });
    controls.current = control;
    return () => { generation.current++; control.stop(); };
  }, [playing, reduced, scenario.id, scenario.duration, runId]);
  useEffect(() => { if (reduced) stop(); }, [reduced]);
  useEffect(() => {
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      generation.current++; controls.current?.stop();
      const id = caseRef.current, point = progressRef.current;
      if (hydrated.current) void beamStore.update(previous => previous.caseId === id ? { ...previous, progress: point } : previous);
    };
  }, []);
  return <main className="kimi-page" aria-label="单筋与双筋演示">
    <header className="kimi-page-heading"><div><h1>单筋与双筋</h1></div></header>
    <div className="kimi-category-tabs" role="group" aria-label="演示内容">
      {([["animation", "受力演示"], ["exploration", "参数探究"]] as const).map(([panel, label]) => <Button key={panel} variant="ghost" aria-pressed={exploration.value.panel === panel}
        disabled={!exploration.writable} onClick={() => { if (panel !== exploration.value.panel) { stop(); void explorationStore.update(previous => ({ ...previous, panel })); } }}>{label}</Button>)}
    </div>
    {exploration.error ? <div className="kimi-feedback mb-4" role="alert"><span>{exploration.error}</span><Button variant="outline" size="sm" onClick={() => void explorationStore.retry()}><RefreshCw />{exploration.writable ? "重试保存" : "重试读取"}</Button></div> : null}
    {!exploration.ready ? <div role="status" aria-label="正在读取演示内容"><Skeleton className="h-72 w-full rounded-2xl" /></div> : exploration.value.panel === "exploration"
      ? <SectionExplorationView state={exploration.value} writable={exploration.writable} update={(patch: Partial<ExplorationState>) => { void explorationStore.update(previous => ({ ...previous, ...patch })); }} />
      : <>
    {saved.error ? <div className="kimi-feedback mt-5" role="alert"><span>{saved.error}</span><Button variant="outline" size="sm" onClick={() => void beamStore.retry()}><RefreshCw />重试</Button></div> : null}
    {!saved.ready ? <div role="status" aria-label="正在读取演示"><Skeleton className="mt-6 h-72 w-full rounded-2xl" /></div> : <>
      <div className="kimi-row mt-6">
        <div className="kimi-choice-pills" role="group" aria-label="构件形式">
          <Button variant="ghost" aria-pressed={scenario.kind === "single"} disabled={!saved.writable} onClick={() => { if (scenario.kind !== "single") selectCase("single-normal"); }}>单筋梁</Button>
          <Button variant="ghost" aria-pressed={scenario.kind === "double"} disabled={!saved.writable} onClick={() => { if (scenario.kind !== "double") selectCase("double-yield"); }}>双筋梁</Button>
        </div>
        <Select value={scenario.id} disabled={!saved.writable} onValueChange={value => selectCase(value as CaseId)}><SelectTrigger className="w-full sm:w-52" aria-label="观察情形"><SelectValue /></SelectTrigger><SelectContent>{casesForKind(scenario.kind).map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>
      </div>
      <Card className="kimi-stage"><CardContent className="px-4 py-5 sm:px-7">
        <div className="kimi-row"><p className="text-sm font-medium">{scenario.label}</p><div className="kimi-choice-pills" role="group" aria-label="观察视图">{([["beam", "梁变形"], ["section", "截面应变"]] as const).map(([view, label]) => <Button key={view} variant="ghost" size="sm" aria-pressed={saved.value.view === view} onClick={() => { stop(); void beamStore.update(previous => ({ ...previous, view: view as DiagramView })); }}>{label}</Button>)}</div></div>
        <div className="my-4" data-animation-case={scenario.id} data-animation-progress={Math.round(progress * 100)}>
          <BeamFigure scenario={scenario} frame={frame} view={saved.value.view} />
        </div>
        <div className="kimi-row text-xs leading-6 text-muted-foreground">
          <span style={{ color: frame.tensionYielded ? ACCENT : undefined }}>受拉筋 · {frame.tensionStatus}</span>
          {scenario.kind === "double" ? <span style={{ color: frame.compressionYielded ? ACCENT : undefined }}>受压筋 · {frame.compressionStatus}</span> : null}
          <span>混凝土 · {frame.concreteStatus}</span>
        </div>
        <div className="mt-5 border-t border-border/60 pt-5">
          <div className="kimi-row"><div className="kimi-actions">
            <Button className="kimi-primary" disabled={!saved.writable || reduced} onClick={() => playing ? stop() : play()}>{playing ? <Pause /> : <Play />}{playing ? "暂停" : progress >= 1 ? "再播放" : "播放"}</Button>
            <Button variant="ghost" disabled={!saved.writable} onClick={() => { seek(0); if (!reduced) play(); }}><RotateCcw />重播</Button>
          </div><span className="text-xs tabular-nums text-muted-foreground">阶段 {frame.stageIndex + 1} / {scenario.stages.length}</span></div>
          <label className="mt-4 block"><span className="sr-only">演示进度</span><Input type="range" min="0" max="100" step="1" value={Math.round(progress * 100)} aria-label="演示进度" aria-valuetext={Math.round(progress * 100) + "%，" + frame.stage.label} disabled={!saved.writable} onChange={event => seek(Number(event.target.value) / 100)} className="h-6 border-0 bg-transparent p-0 accent-ink shadow-none" /></label>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="受力阶段">{scenario.stages.map((stage, index) => <Button key={stage.at} variant={frame.stageIndex === index ? "secondary" : "ghost"} size="sm" className="h-auto min-h-9 whitespace-normal" aria-pressed={frame.stageIndex === index} disabled={!saved.writable} onClick={() => seek(stage.at)}>{stage.label}</Button>)}</div>
        </div>
      </CardContent></Card>
      <section className="mt-6" aria-live="polite"><h2 className="text-sm font-medium">{progress === 0 ? "准备加载" : frame.stage.label}</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">{frame.stage.explanation}</p></section>
      <p className="mt-5 text-xs leading-6 text-muted-foreground">{reduced ? "已按系统设置减弱动态，可拖动进度或逐阶段查看。" : "蓝色表示钢筋达到屈服；变形与裂缝已放大。"} 只显示参与受弯的纵筋，进度不代表荷载或真实时间。</p>
      <details className="kimi-disclosure mt-3"><summary>演示说明</summary><div className="space-y-2 pt-3 text-sm leading-7 text-muted-foreground"><p>单筋只计受拉纵筋的受弯作用；双筋同时考虑受拉、受压纵筋。图中箍筋仅作示意，省略了架立筋。</p><p>双筋的两个情形用于说明：配置受压钢筋并不代表它必然屈服，应结合截面变形和应变判断。</p><p>这是受力过程的教学示意，未进行工程参数求解。动画中的变形、裂缝宽度和阶段时长均不用于实际设计计算。</p></div></details>
    </>}
    </>}
  </main>;
}
