"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/Markdown";
import { AUDIT_STATEMENT, EXAMPLE, STEEL_PRESETS, auditFeedback, evaluateSectionExample } from "./exploration-model";
import { PHASE_ORDER, TEACHING_PHASES } from "./teaching-phases";
import type { ExplorationState } from "./exploration-store";

const INK = "hsl(var(--foreground))";
export default function SectionExplorationView({ state, writable, update }: {
  state: ExplorationState; writable: boolean; update: (patch: Partial<ExplorationState>) => void;
}) {
  const result = evaluateSectionExample(state.steelArea);
  const feedback = auditFeedback(state.auditAnswer);
  const phase = TEACHING_PHASES[state.phase];
  const phaseRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const steelY = 20 + EXAMPLE.effectiveHeight / EXAMPLE.height * 210;
  return <section aria-label="单筋截面参数探究" className="space-y-6">
    <Card className="kimi-stage mt-0"><CardContent className="px-4 py-6 sm:px-7">
      <div className="kimi-row"><h2 className="text-base font-medium">单筋截面参数探究</h2><span className="text-xs text-muted-foreground">教师给定示例</span></div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        b = 250 mm · h = 500 mm · h₀ = 460 mm<br />
        α₁ = 1.0 · f꜀ = 14.3 MPa · fᵧ = 360 MPa<br />
        示例界限：ξᵦ = 0.518 · Aₛ,min = 250 mm²
      </p>
      <label className="mt-6 block">
        <span className="kimi-row text-sm"><span>受拉钢筋面积 Aₛ</span><output className="font-medium tabular-nums" data-testid="steel-area">{state.steelArea} mm²</output></span>
        <Input type="range" aria-label="受拉钢筋面积" aria-valuetext={state.steelArea + "平方毫米，" + result.label}
          min={EXAMPLE.minArea} max={EXAMPLE.maxArea} step={EXAMPLE.step} value={state.steelArea}
          disabled={!writable} onChange={event => update({ steelArea: Number(event.currentTarget.value) })}
          className="mt-4 h-6 border-0 bg-transparent p-0 accent-ink shadow-none" />
      </label>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>100 mm²</span><span>3000 mm²</span></div>
      <div className="kimi-actions mt-4" role="group" aria-label="配筋情境">
        {STEEL_PRESETS.map(preset => <Button key={preset.area} variant="ghost" size="sm" className="rounded-full"
          aria-pressed={state.steelArea === preset.area} disabled={!writable} onClick={() => update({ steelArea: preset.area })}>{preset.label}</Button>)}
      </div>
      <div className="mt-6 border-t border-border/60 pt-5">
        <p className="text-sm font-medium" role="status" data-testid="section-state">{result.label}</p>
        <div className="mt-4 grid items-center gap-6 sm:grid-cols-[210px_1fr]">
          <svg viewBox="0 0 230 260" className="mx-auto block w-full max-w-[180px] sm:max-w-[230px]" role="img"
            aria-label={"按钢筋屈服假定求得受压区高度" + result.x.toFixed(1) + "毫米，" + result.label}>
            <title>单筋矩形截面受压区变化示意</title>
            <rect x="50" y="20" width="130" height="210" fill="hsl(var(--muted))" stroke={INK} strokeOpacity=".45" strokeWidth="1.5" />
            <rect x="50" y="20" width="130" height={result.compressionHeight} fill="var(--kimi-accent)" opacity=".28" />
            <path d={"M37 20 V" + steelY + " M31 20 h12 M31 " + steelY + " h12"} fill="none" stroke={INK} strokeOpacity=".4" />
            <text x="7" y="122" fill={INK} opacity=".65" fontSize="16">h₀</text>
            {[77, 115, 153].map(x => <circle key={x} cx={x} cy={steelY} r={result.barRadius} fill={INK} />)}
            <text x="115" y="251" textAnchor="middle" fill={INK} opacity=".6" fontSize="14">受拉钢筋</text>
          </svg>
          <dl className="grid grid-cols-3 gap-3 sm:grid-cols-1 sm:gap-5">
            <div><dt className="text-xs text-muted-foreground">按钢筋屈服假定求得 x</dt><dd className="mt-1 text-lg tabular-nums" data-testid="section-x">{result.x.toFixed(1)} <span className="text-xs text-muted-foreground">mm</span></dd></div>
            <div><dt className="text-xs text-muted-foreground">相对受压区高度 ξ</dt><dd className="mt-1 text-lg tabular-nums" data-testid="section-xi">{result.xi.toFixed(3)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">适筋模型承载力 Mᵤ</dt><dd className="mt-1 text-lg tabular-nums" data-testid="section-moment">{result.moment === null ? "模型不适用" : <>{result.moment.toFixed(1)} <span className="text-xs text-muted-foreground">kN·m</span></>}</dd></div>
          </dl>
        </div>
        <p className="mt-4 text-sm leading-7 text-muted-foreground" aria-live="polite">{result.explanation}</p>
      </div>
      <details className="kimi-disclosure mt-3"><summary>模型与核验条件</summary><div className="space-y-3 pt-4 text-sm leading-7 text-muted-foreground">
        <Markdown text={"$\\alpha_1 f_c b x=f_y A_s$\n\n$M_u=f_y A_s(h_0-x/2)$\n\n同时满足 $A_s\\geq A_{s,\\min}$ 和 $x\\leq\\xi_b h_0$ 时，才展示本例适筋承载力。"} />
        <p>参数和界限来自附件中的教师给定示例，只讨论正截面受弯；实际设计应按所采用规范完成各项核验。</p>
      </div></details>
    </CardContent></Card>
    <section aria-label="审查示例建议">
      <h2 className="text-sm font-medium">你会采纳这条建议吗？</h2>
      <p className="mt-2 text-xs text-muted-foreground">教师预置的含错建议，供课堂审查。</p>
      <blockquote className="my-4 border-l-2 border-border pl-4 text-sm leading-7">{AUDIT_STATEMENT}</blockquote>
      <div className="kimi-actions" role="group" aria-label="你的判断">
        <Button variant={state.auditAnswer === "yes" ? "secondary" : "outline"} className="h-auto min-h-9 whitespace-normal rounded-full text-left" aria-pressed={state.auditAnswer === "yes"} disabled={!writable} onClick={() => update({ auditAnswer: "yes" })}>可以，承载力足够即可</Button>
        <Button variant={state.auditAnswer === "no" ? "secondary" : "outline"} className="h-auto min-h-9 whitespace-normal rounded-full text-left" aria-pressed={state.auditAnswer === "no"} disabled={!writable} onClick={() => update({ auditAnswer: "no" })}>不能，还需核验其他要求</Button>
      </div>
      {feedback ? <p className="kimi-feedback mt-4 text-sm leading-7" role="status" data-testid="audit-feedback">{feedback}</p> : null}
    </section>
    <details className="kimi-disclosure"><summary>教学流程</summary><div className="pt-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="教学阶段">{PHASE_ORDER.map((key, index) => <Button key={key}
        ref={element => { phaseRefs.current[index] = element; }} id={"phase-tab-" + key}
        role="tab" aria-selected={state.phase === key} aria-controls="teaching-phase-panel" tabIndex={state.phase === key ? 0 : -1}
        variant={state.phase === key ? "secondary" : "ghost"} size="sm" className="rounded-full" disabled={!writable}
        onClick={() => update({ phase: key })} onKeyDown={event => {
          const next = event.key === "Home" ? 0 : event.key === "End" ? PHASE_ORDER.length - 1
            : event.key === "ArrowRight" ? (index + 1) % PHASE_ORDER.length
              : event.key === "ArrowLeft" ? (index + PHASE_ORDER.length - 1) % PHASE_ORDER.length : null;
          if (next !== null) { event.preventDefault(); update({ phase: PHASE_ORDER[next] }); phaseRefs.current[next]?.focus(); }
        }}>{TEACHING_PHASES[key].label}</Button>)}</div>
      <section id="teaching-phase-panel" role="tabpanel" aria-labelledby={"phase-tab-" + state.phase} tabIndex={0} className="mt-5">
        <p className="text-sm leading-7 text-muted-foreground">{phase.intro}</p>
        <ol className="mt-3 divide-y divide-border/60">{phase.items.map(item => <li key={item[0]} className="py-4">
          <p className="text-xs text-muted-foreground">{item[0]}</p><h3 className="mt-1 text-sm font-medium">{item[1]}</h3>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{item[2]}</p><p className="mt-2 text-xs text-muted-foreground">留下证据 · {item[3]}</p>
        </li>)}</ol>
      </section>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">这是教学流程与待采集证据，实际教学成效需实施后验证。</p>
    </div></details>
    <p className="text-xs leading-6 text-muted-foreground">来源：用户提供的“构知教学创新网页”。本页为固定参数教学探究，图形和公式结果不作为工程设计依据。</p>
  </section>;
}
