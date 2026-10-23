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
import { beamOutline, beamY, casesForKind, clampProgress, compressionOutline, crackPoints, getBeamCase, getBeamFrame, steelPath, type BeamCase, type CaseId, type DiagramView } from "./model";

const serverSnapshot = beamStore.getSnapshot();
const INK = "hsl(var(--foreground))";
const MUTED = "hsl(var(--muted))";
const ACCENT = "var(--kimi-accent)";
const DAMAGE = "hsl(var(--destructive))";
type Frame = ReturnType<typeof getBeamFrame>;

/** 业务示意图：SVG用于连续变形和应变分布，交互控件仍使用既有组件。 */
function BeamFigure({ scenario, frame, view }: { scenario: BeamCase; frame: Frame; view: DiagramView }) {
  const id = "beam-shape-" + scenario.id;
  const steelColor = frame.tensionYielded ? ACCENT : INK;
  const compressionColor = frame.compressionYielded ? ACCENT : INK;
  const cracks = scenario.id === "single-low" ? [300] : scenario.id === "single-high" ? [210, 255, 300, 345, 390] : [230, 300, 370];
  const neutralY = 42 + frame.neutralDepth * 210;
  const strainX = (depth: number) => 400 + frame.progress * 140 * (depth - frame.neutralDepth);
  return <svg viewBox="0 0 600 290" className="mx-auto block w-full max-w-2xl" role="img"
    aria-label={(scenario.kind === "single" ? "单筋梁" : "双筋梁") + "，" + scenario.label + "，" + frame.stage.label + (view === "beam" ? "，梁的变形示意" : "，截面与线性应变分布示意")}>
    <title>{scenario.label} · {frame.stage.label}</title>
    {view === "beam" ? <>
      <defs><clipPath id={id}><path d={beamOutline(frame.sag)} /></clipPath></defs>
      <path d={beamOutline(frame.sag)} fill={MUTED} stroke={INK} strokeOpacity=".35" strokeWidth="1.5" />
      <path d={compressionOutline(frame.sag, frame.neutralDepth)} fill={INK} opacity={frame.progress > 0 ? .09 : 0} />
      <g clipPath={"url(#" + id + ")"}>
        {frame.crackExtent > 0 ? cracks.map((x, index) => <polyline key={x}
          points={crackPoints(x, frame.crackExtent * (index === Math.floor(cracks.length / 2) ? 1 : .75), frame.neutralDepth, frame.sag)}
          fill="none" stroke={DAMAGE} strokeWidth={frame.crackWidth} strokeLinecap="round" strokeLinejoin="round" />) : null}
        {frame.damage > 0 ? <g stroke={DAMAGE} strokeWidth="3" opacity={frame.damage}>{[-20, 0, 20].map(offset => <path key={offset} d={"M" + (300 + offset - 8) + " " + beamY(300, 0, frame.sag) + " l16 12 m-16 0 l16 -12"} />)}</g> : null}
        <path d={steelPath(.85, frame.sag)} fill="none" stroke={steelColor} strokeWidth={scenario.id === "single-low" ? 3 : scenario.id === "single-high" ? 8 : 5} strokeLinecap="round" />
        {scenario.kind === "double" ? <path d={steelPath(.15, frame.sag)} fill="none" stroke={compressionColor} strokeWidth="5" strokeLinecap="round" /> : null}
        {frame.progress > 0 ? <path d={steelPath(frame.neutralDepth, frame.sag)} fill="none" stroke={INK} strokeOpacity=".35" strokeWidth="1" strokeDasharray="6 6" /> : null}
      </g>
      <g stroke={INK} strokeOpacity=".55" fill="none" strokeWidth="1.5">
        <path d="M62 182 l-14 23 h28 Z M538 182 l-14 23 h28 Z M40 211 h44 M516 218 h44" />
        <circle cx="530" cy="211" r="4" /><circle cx="546" cy="211" r="4" />
      </g>
      <g opacity={frame.progress > 0 ? .65 : .2} fill={INK} stroke={INK} strokeWidth="2">
        {[205, 395].map(x => { const y = beamY(x, 0, frame.sag) - 8; return <g key={x}><path d={"M" + x + " 42 V" + y} /><path d={"M" + (x - 5) + " " + (y - 9) + " L" + x + " " + y + " L" + (x + 5) + " " + (y - 9)} fill="none" /></g>; })}
      </g>
      <text x="300" y="26" textAnchor="middle" fill={INK} className="text-[24px] sm:text-[17px]">向下加载</text>
      <text x="300" y="278" textAnchor="middle" fill={INK} opacity=".55" className="text-[24px] sm:text-[15px]">上缘受压 · 下缘受拉</text>
    </> : <>
      <text x="145" y="26" textAnchor="middle" fill={INK} className="text-[24px] sm:text-[18px]">截面</text>
      <text x="400" y="26" textAnchor="middle" fill={INK} className="text-[24px] sm:text-[18px]">应变</text>
      <rect x="80" y="42" width="130" height="210" rx="3" fill={MUTED} stroke={INK} strokeOpacity=".4" strokeWidth="1.5" />
      <rect x="80" y="42" width="130" height={frame.neutralDepth * 210} fill={INK} opacity={frame.progress > 0 ? .09 : 0} />
      {frame.progress > 0 ? <path d={"M60 " + neutralY + " H490"} stroke={INK} strokeOpacity=".3" strokeDasharray="6 6" /> : null}
      {Array.from({ length: scenario.bars }, (_, i) => <circle key={i} cx={100 + i * 90 / Math.max(1, scenario.bars - 1)} cy={220} r={scenario.id === "single-low" ? 5 : 7} fill={steelColor} />)}
      {scenario.kind === "double" ? <>{[107, 183].map(x => <circle key={x} cx={x} cy={74} r="7" fill={compressionColor} />)}</> : null}
      {frame.crackExtent > 0 ? <g stroke={DAMAGE} strokeWidth={frame.crackWidth} fill="none">{[115, 165].map(x => <path key={x} d={"M" + x + " 252 l5 -" + ((1 - frame.neutralDepth) * 95 * frame.crackExtent) + " l-6 -" + ((1 - frame.neutralDepth) * 65 * frame.crackExtent)} />)}</g> : null}
      {frame.damage > 0 ? <g opacity={frame.damage} stroke={DAMAGE} strokeWidth="3">{[100, 125, 150, 175].map(x => <path key={x} d={"M" + x + " 43 l13 13 m-13 0 l13 -13"} />)}</g> : null}
      <path d="M400 40 V257 M290 252 H515" stroke={INK} strokeOpacity=".35" strokeWidth="1" />
      <path d={"M" + strainX(0) + " 42 L" + strainX(1) + " 252"} fill="none" stroke={INK} strokeWidth="2.5" />
      <circle cx={strainX(.85)} cy={42 + .85 * 210} r="6" fill={steelColor} />
      {scenario.kind === "double" ? <circle cx={strainX(.15)} cy={42 + .15 * 210} r="6" fill={compressionColor} /> : null}
      <text x="400" y="279" textAnchor="middle" fill={INK} opacity=".6" className="text-[24px] sm:text-[15px]">左侧受压 · 右侧受拉</text>
    </>}
  </svg>;
}

export default function BeamDemoView() {
  const saved = useSyncExternalStore(beamStore.subscribe, beamStore.getSnapshot, () => serverSnapshot);
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
  useEffect(() => {
    if (saved.ready && saved.writable && !playingRef.current) {
      caseRef.current = saved.value.caseId;
      setFrameProgress(saved.value.progress); hydrated.current = true;
    }
  }, [saved.ready, saved.writable, saved.value.caseId, saved.value.progress]);
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
    <header className="kimi-page-heading"><div><h1>单筋与双筋演示</h1><p>看清钢筋屈服与混凝土破坏的先后。</p></div></header>
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
      <details className="kimi-disclosure mt-3"><summary>演示说明</summary><div className="space-y-2 pt-3 text-sm leading-7 text-muted-foreground"><p>单筋只计受拉纵筋的受弯作用；双筋同时考虑受拉、受压纵筋。图中省略了架立筋和箍筋。</p><p>双筋的两个情形用于说明：配置受压钢筋并不代表它必然屈服，应结合截面变形和应变判断。</p><p>这是受力过程的教学示意，未进行工程参数求解。动画中的变形、裂缝宽度和阶段时长均不用于实际设计计算。</p></div></details>
    </>}
  </main>;
}
