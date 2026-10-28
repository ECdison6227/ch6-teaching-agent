"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, Calculator, CheckCircle2, ChevronDown, Download, Layers3, LoaderCircle, MessageSquare, RotateCcw, Ruler, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AiSidePanel, useAiDrawer } from "@/components/AiDrawer";
import { appPath } from "@/lib/app-path";
import { useHydratedReducedMotion } from "@/hooks/use-hydrated-reduced-motion";
import {
  BEAM_CLASS_ORDER, beamClassLabel, beamErrorMessage, beamNumber, isBeamResult,
  type BeamDesignRequest, type BeamDoubleRequest, type BeamDoubleResult, type BeamResult, type BeamReviewRequest, type BeamTask,
} from "@/lib/beam-types";

type BeamForm = {
  b: string; h: string; h0: string; concrete: string; steel: string; moment: string;
  area: string; geometryMode: "estimated" | "direct"; environment: string; life: string;
  stirrup: string; longitudinal: string;
  compressionSteel: string; aPrime: string; compressionArea: string;
};

const DESIGN_EXAMPLE: BeamForm = {
  b: "250", h: "500", h0: "462", concrete: "C30", steel: "HRB400", moment: "175",
  area: "", geometryMode: "estimated", environment: "I", life: "50", stirrup: "8", longitudinal: "20",
  compressionSteel: "HRB400", aPrime: "40", compressionArea: "500",
};
const REVIEW_EXAMPLE: BeamForm = {
  b: "200", h: "450", h0: "414", concrete: "C30", steel: "HRB400", moment: "80",
  area: "603", geometryMode: "direct", environment: "I", life: "50", stirrup: "8", longitudinal: "20",
  compressionSteel: "HRB400", aPrime: "40", compressionArea: "500",
};
const DOUBLE_A_EXAMPLE: BeamForm = {
  ...DESIGN_EXAMPLE, b: "300", h: "600", h0: "560", moment: "600", geometryMode: "direct",
};
const DOUBLE_B_EXAMPLE: BeamForm = { ...DOUBLE_A_EXAMPLE, moment: "300" };
const EXAMPLES: Record<BeamTask, BeamForm> = {
  design: DESIGN_EXAMPLE, review: REVIEW_EXAMPLE, "double-a": DOUBLE_A_EXAMPLE, "double-b": DOUBLE_B_EXAMPLE,
};
const TASK_LABELS: Record<BeamTask, string> = {
  design: "单筋设计", review: "单筋复核", "double-a": "双筋设计 A", "double-b": "双筋设计 B",
};
const TASK_OPTIONS = [
  { key: "design", Icon: Calculator },
  { key: "review", Icon: ShieldCheck },
  { key: "double-a", Icon: Layers3 },
  { key: "double-b", Icon: Calculator },
] as const;
const DOUBLE_BRANCH_LABELS: Record<string, string> = {
  single_sufficient: "单筋已能满足，不调用双筋模型",
  limit_doubly_yielded: "界限受压区设计 · 受压钢筋屈服",
  limit_doubly_compression_elastic: "界限受压区设计 · 受压钢筋未屈服",
  zero_compression_single: "给定受压面积为零 · 按单筋计算",
  small_x_code_simplification: "小受压区 · 规范简化面积并独立复核",
  compression_unyielded: "应变兼容计算 · 受压钢筋未屈服",
  compression_yielded: "受压钢筋已屈服",
};
const isDoubleTask = (task: BeamTask): task is "double-a" | "double-b" => task === "double-a" || task === "double-b";
const isDoubleResult = (result: BeamResult): result is BeamDoubleResult => isDoubleTask(result.task);
const INPUT_LABELS: Record<string, string> = {
  b_mm: "梁宽 b", h_mm: "梁高 h", h0_mm: "有效高度 h₀", concrete: "混凝土", steel: "钢筋",
  M_design_kNm: "设计弯矩 M", As_provided_mm2: "实配面积 As", environment_class: "环境类别",
  design_life_years: "设计使用年限", stirrup_d_mm: "箍筋直径", assumed_longitudinal_d_mm: "预估纵筋直径",
  compression_steel: "受压钢筋等级", as_prime_mm: "受压合力点距离 a′ₛ（mm）", Asp_given_mm2: "给定受压面积 As′（mm²）",
};
const REFERENCE_LABELS: Record<string, string> = {
  As_required_mm2: "所需面积 As（mm²）", As_min_mm2: "最小配筋面积（mm²）",
  As_max_mm2: "单筋界限面积（mm²）", As_provided_mm2: "实配面积（mm²）",
  Mu_reference_kNm: "抗弯承载力 Mu（kN·m）", Mu_limit_kNm: "单筋极限弯矩（kN·m）",
  M_design_kNm: "设计弯矩 M（kN·m）", x_mm: "受压区高度 x（mm）", xi: "相对受压区高度 ξ",
  xi_b: "界限相对受压区高度 ξb", rho: "配筋率 ρ", rho_min: "最小配筋率 ρmin",
  As_yield_limit_mm2: "单筋界限面积（mm²）", M_limit_kNm: "单筋极限弯矩（kN·m）",
  x_required_mm: "所需受压区高度（mm）", x_yield_assumed_mm: "假定钢筋屈服的受压区高度（mm）",
  xi_required: "所需相对受压区高度 ξ", rho_given_gross: "实配配筋率 ρ（按全截面）",
  rho_required_gross: "所需配筋率 ρ（按全截面）", xi_yield_assumed: "屈服假定下相对受压区高度 ξ",
  Asp_required_mm2: "所需受压面积 As′（mm²）", Asp_given_mm2: "给定受压面积 As′（mm²）",
  M_single_limit_kNm: "单筋界限弯矩（kN·m）", M_capacity_limit_kNm: "当前面积容量界限（kN·m）",
  Mu_verified_kNm: "参考面积数值复核 Mu（kN·m）", capacity_margin_kNm: "参考面积 Mu − M（kN·m）",
  x_verified_mm: "参考面积复核受压区高度（mm）", x_limit_mm: "界限受压区高度（mm）",
  sigma_c_prime_MPa: "受压钢筋应力（MPa）", xi_limit: "界限相对受压区高度 ξb",
};
const GEOMETRY_BASIS_LABELS: Record<string, string> = {
  provided_effective_height: "填写的有效高度",
  assumed_single_layer_cover_stirrup_diameter_v1: "按预估单排位置计算",
  provided_double_reinforcement_positions: "填写的受拉、受压钢筋合力位置",
};
const STATUS_LABELS: Record<string, string> = {
  ok: "当前规则范围内", needs_redesign: "需要调整截面或设计方案",
  below_minimum_reinforcement: "实配面积低于最小配筋",
  beyond_single_reinforced_method: "超出当前单筋简式适用范围",
  needs_more_compression: "受压面积不足或需调整截面",
  unsupported_geometry: "超出当前双筋几何条件",
  unsupported_material: "材料不在当前支持范围",
  invalid_input: "输入条件不适用",
  reference_verification_failed: "公式参考数值复核未通过",
};

function requestFor(task: BeamTask, form: BeamForm): BeamDesignRequest | BeamReviewRequest | BeamDoubleRequest {
  const common = { b_mm: Number(form.b), h_mm: Number(form.h), concrete: form.concrete, steel: form.steel };
  if (isDoubleTask(task)) {
    return { ...common, h0_mm: Number(form.h0), as_prime_mm: Number(form.aPrime), compression_steel: form.compressionSteel,
      M_design_kNm: Number(form.moment), ...(task === "double-b" ? { Asp_given_mm2: Number(form.compressionArea) } : {}) };
  }
  if (task === "review") {
    return { ...common, h0_mm: Number(form.h0), As_provided_mm2: Number(form.area), ...(form.moment.trim() ? { M_design_kNm: Number(form.moment) } : {}) };
  }
  if (form.geometryMode === "direct") {
    return { ...common, M_design_kNm: Number(form.moment), h0_mm: Number(form.h0) };
  }
  return {
    ...common, M_design_kNm: Number(form.moment),
    environment_class: form.environment, design_life_years: Number(form.life),
    stirrup_d_mm: Number(form.stirrup), assumed_longitudinal_d_mm: Number(form.longitudinal),
  };
}

function referenceReason(result: BeamResult): string | null {
  for (const key of ["reason", "message", "note"]) {
    const value = result.reference[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function resultSummary(result: BeamResult): string {
  if (isDoubleResult(result)) return JSON.stringify({
    任务: TASK_LABELS[result.task], 规则状态: result.status, 输入: result.inputs, 材料设计值: result.materials,
    几何: result.geometry, 调用双筋模型: result.model_called, 模型预测: result.predictions, 公式参考: result.reference,
    比较: result.comparisons, 预测面积数值复核: result.prediction_review, 提示: result.warnings, 适用范围: result.scope,
  }, null, 2);
  return JSON.stringify({
    任务: TASK_LABELS[result.task],
    规则状态: result.status, 输入: result.inputs, 几何: result.geometry,
    模型分类: beamClassLabel(result.task, result.classification.class_name),
    模型分类概率: result.classification.probabilities, 模型预测: result.prediction,
    公式参考: result.reference, 比较: result.comparison, 提示: result.warnings, 适用范围: result.scope,
  }, null, 2);
}

function DoubleResults({ result, explain, download }: { result: BeamDoubleResult; explain: () => void; download: () => void }) {
  const targets = result.task === "double-a" ? ["As_required_mm2", "Asp_required_mm2"] as const : ["As_required_mm2"] as const;
  const review = result.prediction_review;
  const branch = typeof result.reference.branch === "string" ? result.reference.branch : "";
  return <>
    <Card className="overflow-hidden rounded-[20px] border-border/60 bg-card shadow-none ">
      <CardHeader className="space-y-3 border-b border-border/60 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium tracking-normal text-foreground">双筋实验结果</p><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${result.status === "ok" ? "bg-muted/50 text-foreground" : "bg-amber-50 text-amber-800"}`}>{result.status === "ok" ? <CheckCircle2 className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}{STATUS_LABELS[result.status] ?? result.status}</span></div>
        <CardTitle className="text-base font-medium text-foreground">{result.task === "double-a" ? "同时求受拉与受压钢筋面积" : "给定受压面积，求受拉钢筋面积"}</CardTitle>
        {referenceReason(result) ? <p className={`text-xs leading-5 ${result.status === "ok" ? "text-muted-foreground" : "text-amber-900"}`}>{referenceReason(result)}</p> : null}
      </CardHeader>
      <CardContent className="space-y-5 px-5 pb-5 pt-5">
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-foreground" aria-label="本次材料设计值">本次材料设计值（MPa）：fc = {beamNumber(result.materials.fc_MPa)}，ft = {beamNumber(result.materials.ft_MPa)}，fy = {beamNumber(result.materials.fy_MPa)}，fy′ = {beamNumber(result.materials.fyp_MPa)}。</p>
        {result.task === "double-b" ? <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-5 text-foreground">给定受压面积 As′ = <strong className="tabular-nums">{beamNumber(result.inputs.Asp_given_mm2)} mm²</strong><span className="block text-xs text-muted-foreground">这是本次输入，不是模型预测输出。</span></p> : null}
        {!result.model_called ? <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-xs leading-5 text-amber-900">{branch === "single_sufficient" ? "给定条件下单筋已能满足，本次未调用双筋模型。下方保留公式参考面积；如需单筋模型预测，可切换“给定弯矩求配筋”。" : "当前条件未调用双筋模型，请根据规则原因调整输入；公式参考与模型预测分开展示。"}</p> : null}
        {targets.map(target => {
          const prediction = result.predictions?.[target];
          const comparison = result.comparisons?.[target];
          const reference = result.reference[target];
          return <section key={target} className="space-y-3" aria-label={target === "As_required_mm2" ? "受拉面积结果" : "受压面积结果"}>
            <h3 className="text-sm font-medium text-foreground">{target === "As_required_mm2" ? "受拉钢筋面积 As" : "受压钢筋面积 As′"}</h3>
            <dl className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 min-[360px]:gap-3 sm:gap-5">
              <div className="min-w-0"><dt className="text-xs font-medium text-foreground">模型预测</dt><dd className="mt-2 break-all text-[28px] font-medium leading-tight tracking-tight tabular-nums text-foreground sm:text-[34px]">{prediction ? beamNumber(prediction.value) : "未调用"}</dd><dd className="mt-1 text-xs text-muted-foreground">{prediction ? "mm²" : "本次无模型预测值"}</dd></div>
              <div className="min-w-0 border-t border-border/60 pt-4 min-[360px]:border-l min-[360px]:border-t-0 min-[360px]:pl-3 min-[360px]:pt-0 sm:pl-5"><dt className="text-xs font-medium text-muted-foreground">规范公式参考</dt><dd className="mt-2 break-all text-[28px] font-medium leading-tight tracking-tight tabular-nums text-foreground sm:text-[34px]">{beamNumber(reference)}</dd><dd className="mt-1 text-xs text-muted-foreground">{typeof reference === "number" ? "mm²" : "当前条件无适用数值"}</dd></div>
            </dl>
            {comparison ? <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 bg-muted/50 px-3.5 py-3"><div className="min-w-0"><dt className="text-xs leading-4 text-muted-foreground">预测 − 公式参考</dt><dd className="mt-1.5 break-words text-sm font-medium tabular-nums text-foreground">{comparison.model_minus_reference > 0 ? "+" : ""}{beamNumber(comparison.model_minus_reference)} <span className="text-xs font-normal text-muted-foreground">mm²</span></dd></div><div className="min-w-0"><dt className="text-xs leading-4 text-muted-foreground">相对差值</dt><dd className="mt-1.5 text-sm font-medium tabular-nums text-foreground">{typeof comparison.relative_error_percent === "number" ? `${comparison.relative_error_percent > 0 ? "+" : ""}${beamNumber(comparison.relative_error_percent)}%` : "参考值为零，不计算百分比"}</dd></div></dl> : null}
          </section>;
        })}
        {branch ? <p className="text-xs leading-5 text-muted-foreground">公式计算分支：<span className="font-medium text-foreground">{DOUBLE_BRANCH_LABELS[branch] ?? branch}</span></p> : null}
        <p className="text-xs leading-5 text-muted-foreground">模型面积保留原始预测值，公式参考与数值复核分别展示。两项双筋任务不调用原有的单筋分类模型。</p>
        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4"><Button type="button" variant="outline" size="sm" onClick={explain} className="rounded-full h-9 gap-2 border-border/60 bg-muted/50 text-xs text-foreground shadow-none hover:bg-muted/50"><MessageSquare className="size-3.5" aria-hidden />AI 讲解</Button><Button type="button" variant="ghost" size="sm" onClick={download} className="rounded-full h-9 gap-2 px-2 text-xs text-muted-foreground hover:bg-muted/50"><Download className="size-3.5" aria-hidden />下载结果 JSON</Button></div>
      </CardContent>
    </Card>
    {result.warnings.length ? <Card className="rounded-xl border-amber-200/80 bg-amber-50/50 shadow-none"><CardHeader className="px-4 pb-2 pt-3.5"><CardTitle className="flex items-center gap-2 text-xs font-medium text-amber-900"><AlertTriangle className="size-4 shrink-0" aria-hidden />本次适用性提示</CardTitle></CardHeader><CardContent className="px-4 pb-3.5"><ul className="list-disc space-y-1.5 pl-4 text-xs leading-5 text-amber-900/80">{result.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></CardContent></Card> : null}
    {review ? <Card className="rounded-[20px] border-border/60 bg-card shadow-none">
      <CardHeader className="space-y-2 px-5 pb-3 pt-4"><CardTitle className="text-sm font-medium text-foreground">预测面积的数值复核</CardTitle><CardDescription className="text-xs leading-5 text-muted-foreground">等效矩形应力图力平衡复核；结果不用于自动修正上面的模型面积。</CardDescription></CardHeader>
      <CardContent className="space-y-3 px-5 pb-4">
        {review.status === "ok" ? <>
          <dl className="grid grid-cols-2 gap-4"><div className="min-w-0"><dt className="text-xs text-muted-foreground">复核承载力 Mu（kN·m）</dt><dd className="mt-1 break-all text-xl font-medium tabular-nums text-foreground">{beamNumber(review.Mu_kNm)}</dd></div><div className="min-w-0"><dt className="text-xs text-muted-foreground">Mu − M（kN·m）</dt><dd className="mt-1 break-all text-xl font-medium tabular-nums text-foreground">{beamNumber(review.capacity_margin_kNm)}</dd></div></dl>
          <dl className="grid gap-2 text-xs min-[400px]:grid-cols-2">{[["最小受拉配筋面积", review.minimum_area_meets], ["等效状态受拉屈服", review.tension_yielded], ["等效状态受压屈服", review.compression_yielded]].map(([label, value]) => <div key={String(label)} className="flex flex-wrap justify-between gap-x-3 gap-y-1"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium text-foreground">{typeof value === "boolean" ? value ? "是" : "否" : "—"}</dd></div>)}</dl>
          <p className={`rounded-lg px-3 py-2 text-xs font-medium leading-5 ${review.numerical_checks_passed ? "bg-muted/50 text-foreground" : "bg-amber-50 text-amber-900"}`}>{review.numerical_checks_passed ? "等效应力图下承载力与最小面积数值条件已满足。" : "等效应力图下的数值条件未全部满足，请结合模型差值及适用条件复核。"}</p>
          {review.equivalent_state_exceeds_steel_ultimate_strain ? <p className="text-xs leading-5 text-amber-900">等效状态反算 εt &gt; 0.01。该标记不直接否定规范实用面积标签，也不代表钢筋极限拉应变已验算合格。</p> : null}
        </> : <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">{review.reason || "预测面积不满足当前数值复核条件。"}模型原始面积已保留。</p>}
        <p className="text-xs leading-5 text-muted-foreground">未执行完整破坏模式、全过程极限拉应变及实际钢筋布置验算；不能将本次数值复核等同于完整设计通过。</p>
      </CardContent>
    </Card> : null}
    <Card className="overflow-hidden rounded-xl border-border/60 bg-card shadow-none"><details className="group"><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden"><span>计算依据与记录<span className="ml-2 text-xs font-normal text-muted-foreground">材料映射、输入与公式中间量</span></span><ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden /></summary><CardContent className="space-y-4 border-t border-border/60 px-5 pb-5 pt-4">
      <p className="text-xs leading-5 text-muted-foreground">h₀ = {beamNumber(result.geometry.h0_mm)} mm；a′ₛ = {beamNumber(result.geometry.as_prime_mm)} mm。两者采用本次填写值。</p>
      <dl className="grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">{Object.entries(result.inputs).filter(([key, value]) => key in INPUT_LABELS && (typeof value === "string" || typeof value === "number")).map(([key, value]) => <div key={key} className="flex justify-between gap-3"><dt className="text-muted-foreground">{key === "steel" ? "受拉钢筋等级" : INPUT_LABELS[key]}</dt><dd className="break-words text-right tabular-nums text-foreground">{String(value)}</dd></div>)}</dl>
      <Separator className="bg-muted/50" />
      <h3 className="text-xs font-medium text-foreground">本次等级映射采用的材料设计值（MPa）</h3>
      <dl className="grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">{[["fc_MPa", "混凝土抗压 fc"], ["ft_MPa", "混凝土抗拉 ft"], ["fy_MPa", "受拉钢筋 fy"], ["fyp_MPa", "受压钢筋 fy′"], ["Es_MPa", "钢筋弹性模量 Es"]].map(([key, label]) => <div key={key} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums text-foreground">{beamNumber(result.materials[key as keyof typeof result.materials])}</dd></div>)}</dl>
      <Separator className="bg-muted/50" />
      <dl className="grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">{Object.entries(result.reference).filter(([key, value]) => key in REFERENCE_LABELS && typeof value === "number" && Number.isFinite(value)).map(([key, value]) => <div key={key} className="flex justify-between gap-3"><dt className="text-muted-foreground">{REFERENCE_LABELS[key]}</dt><dd className="shrink-0 text-right tabular-nums text-foreground">{beamNumber(value, ["rho_min", "xi_limit", "xi_verified"].includes(key) ? 4 : 2)}</dd></div>)}</dl>
      <p className="text-xs leading-5 text-muted-foreground">{result.scope}</p>
    </CardContent></details></Card>
  </>;
}

/** 表单和结果属于本视图；AI 对话沿用全站 AiDrawerProvider。 */
export function BeamLabView({ active = true }: { active?: boolean }) {
  const [task, setTask] = useState<BeamTask>("design");
  const [forms, setForms] = useState<Record<BeamTask, BeamForm>>({ design: { ...DESIGN_EXAMPLE }, review: { ...REVIEW_EXAMPLE }, "double-a": { ...DOUBLE_A_EXAMPLE }, "double-b": { ...DOUBLE_B_EXAMPLE } });
  const [result, setResult] = useState<BeamResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useHydratedReducedMotion();
  const { ask, open, bindSlide } = useAiDrawer();
  const form = forms[task];
  const doubleTask = isDoubleTask(task);

  useEffect(() => { if (active) bindSlide(null); }, [active, bindSlide]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (!active) controller.current?.abort(); }, [active]);
  useEffect(() => {
    if (result && active) {
      resultRef.current?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
      resultRef.current?.focus({ preventScroll: true });
    }
  }, [result, active, reduceMotion]);

  const clearResult = () => { if (result) setEdited(true); setResult(null); setError(null); };
  const update = (key: keyof BeamForm, value: string) => {
    clearResult();
    setForms((current) => ({ ...current, [task]: { ...current[task], [key]: value } }));
  };
  const chooseTask = (next: BeamTask) => {
    if (submitting.current || task === next) return;
    setTask(next); setResult(null); setError(null); setEdited(false);
  };
  const resetExample = () => {
    if (submitting.current) return;
    setForms((current) => ({ ...current, [task]: { ...EXAMPLES[task] } }));
    setResult(null); setError(null); setEdited(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const request = requestFor(task, form);
    const values = Object.values(request).filter((value) => typeof value === "number");
    if (values.some((value) => !Number.isFinite(value))) {
      setError("请填写完整、有效的数值。"); submitting.current = false; return;
    }
    if (request.b_mm <= 0 || request.h_mm <= 0 || ("h0_mm" in request && request.h0_mm !== undefined && (request.h0_mm <= 0 || request.h0_mm >= request.h_mm))) {
      setError("梁宽、梁高应大于 0，有效高度 h₀ 应大于 0 且小于梁高 h。"); submitting.current = false; return;
    }
    if ("as_prime_mm" in request && (request.as_prime_mm <= 0 || request.as_prime_mm >= request.h0_mm)) {
      setError("受压钢筋合力点距离 a′ₛ 应大于 0 且小于有效高度 h₀。"); submitting.current = false; return;
    }
    setLoading(true); setResult(null); setError(null); setEdited(false);
    const abort = new AbortController();
    controller.current = abort;
    const timer = window.setTimeout(() => abort.abort(), 60_000);
    try {
      const response = await fetch(appPath(`/api/beam/${task}`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request), signal: abort.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(beamErrorMessage(body, response.status));
      if (!isBeamResult(body) || body.task !== task) throw new Error("计算服务返回的结果不完整，请重试或检查服务状态。");
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "AbortError"
        ? "计算请求超时或已取消，可以重试。"
        : cause instanceof Error ? cause.message : "暂时无法连接计算服务，请稍后重试。");
    } finally {
      window.clearTimeout(timer); controller.current = null; submitting.current = false; setLoading(false);
    }
  };

  const explain = () => {
    if (!result) return;
    bindSlide(null);
    const doubleResult = isDoubleResult(result);
    ask({
      question: doubleResult
        ? `请结合双筋矩形截面计算，用教学方式讲解下列实际模型调用结果。说明等级到材料设计值的映射、h₀与a′ₛ、规则分支、预测面积与公式参考差异。双筋A同时预测受拉和受压面积，双筋B的受压面积是输入。数值以结果为准；模型未调用或规则不适用时解释原因，不补造数值。双筋任务没有分类概率。等效矩形应力图数值复核不等于完整破坏模式、极限拉应变和实际排布验算，不宣称完整设计通过。\n\n${resultSummary(result)}`
        : `请结合 K5 单筋矩形截面计算，用教学方式讲解下列实际模型调用结果。说明输入、规则适用性、模型值和公式参考的差异。数值以这份结果为准；如果预测为空或规则不适用，请解释原因和下一步，不补造数值。设计状态分类 A 不代表实配梁破坏形态；分类 B 的适筋也不等于承载力满足。\n\n${resultSummary(result)}`,
      context: { mode: "beam-lab", page: 0, section: doubleResult ? "双筋矩形截面配筋计算" : "K5 单筋矩形截面计算" },
    });
  };

  const download = () => {
    if (!result) return;
    const file = new Blob([JSON.stringify(result, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url; link.download = `梁截面${result.task === "design" ? "配筋设计" : result.task === "review" ? "实配复核" : TASK_LABELS[result.task]}-${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })}.json`;
    document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const unit = task === "review" ? "kN·m" : "mm²";
  const referenceValue = result?.reference[task === "review" ? "Mu_reference_kNm" : "As_required_mm2"];
  const reason = result ? referenceReason(result) : null;
  const fields = [
    { key: "b" as const, label: "梁宽 b（mm）" },
    { key: "h" as const, label: "梁高 h（mm）" },
  ];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className={`min-h-0 min-w-0 flex-1 overflow-y-auto bg-background ${open && active ? "hidden md:block" : ""}`}>
        <main className="kimi-page kimi-beam-page">
          <header className="kimi-page-heading"><div><h1>智能配筋</h1><p>设置截面，比较模型预测与公式参考。</p></div></header>
          <div className="kimi-choice-pills mt-6" role="group" aria-label="选择实验任务">
            {TASK_OPTIONS.map(({ key, Icon }) => <Button key={key} type="button" variant="ghost" className="rounded-full text-sm" disabled={loading} aria-pressed={task === key} onClick={() => chooseTask(key)}><Icon aria-hidden />{TASK_LABELS[key]}</Button>)}
          </div>
          <p className="kimi-footnote mt-3">普通非抗震 · 非预应力 · {doubleTask ? "双筋矩形截面" : "单筋矩形截面"}</p>

          <div className="mt-6 grid items-start gap-6">
            <Card className="min-w-0 overflow-hidden rounded-[20px] border-border/60 bg-card shadow-none ">
              <CardHeader className="space-y-1.5 border-b border-border/60 px-5 py-4">
                <div className="flex items-center justify-between gap-3"><CardTitle className="text-sm font-medium text-foreground">{doubleTask ? "设置双筋设计条件" : task === "design" ? "设置设计条件" : "填写实际截面与配筋"}</CardTitle><span className="shrink-0 text-xs font-medium tracking-wider text-muted-foreground">输入参数</span></div>
                <CardDescription className="text-xs leading-5 text-muted-foreground">{task === "double-a" ? "输入截面、两侧材料与钢筋位置，同时预测受拉和受压连续面积。" : task === "double-b" ? "输入已有受压面积，预测所需受拉连续面积，并单独展示公式参考和数值复核。" : task === "design" ? "由弯矩需求预测连续钢筋面积，选筋排布后再做实配复核。" : "填写实际几何与钢筋面积，比较承载力与弯矩需求。"}</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-4">
                <form onSubmit={submit}>
                  <fieldset disabled={loading} className="kimi-beam-fields min-w-0">
                    <legend className="sr-only">{TASK_LABELS[task]}参数</legend>
                    <section className="space-y-3" aria-labelledby="beam-section-heading">
                      <h2 id="beam-section-heading" className="flex items-center gap-2 text-xs font-medium text-foreground"><Ruler className="size-3.5 text-foreground" aria-hidden />截面尺寸</h2>
                      <div className="grid grid-cols-2 gap-3">
                        {fields.map(({ key, label }) => <label key={key} className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>{label}</span><Input name={key} type="number" inputMode="decimal" min="0.01" step="any" required value={form[key]} onChange={(event) => update(key, event.target.value)} className="h-11 rounded-xl border-border/60 bg-muted/50 text-sm tabular-nums shadow-none focus-visible:ring-ring/25" /></label>)}
                      </div>
                    </section>
                    <Separator className="bg-muted/50" />
                    <section className="space-y-3" aria-labelledby="beam-material-heading">
                      <h2 id="beam-material-heading" className="flex items-center gap-2 text-xs font-medium text-foreground"><Layers3 className="size-3.5 text-foreground" aria-hidden />材料等级</h2>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><label htmlFor={`beam-${task}-concrete`}>混凝土等级</label><Select value={form.concrete} onValueChange={(value) => update("concrete", value)} disabled={loading}><SelectTrigger id={`beam-${task}-concrete`} className="h-11 rounded-xl border-border/60 bg-muted/50 shadow-none focus:ring-ring/25"><SelectValue /></SelectTrigger><SelectContent>{["C30", "C35", "C40"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                        <div className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><label htmlFor={`beam-${task}-steel`}>{doubleTask ? "受拉钢筋等级" : "钢筋等级"}</label><Select value={form.steel} onValueChange={(value) => update("steel", value)} disabled={loading}><SelectTrigger id={`beam-${task}-steel`} className="h-11 rounded-xl border-border/60 bg-muted/50 shadow-none focus:ring-ring/25"><SelectValue /></SelectTrigger><SelectContent>{["HRB400", "HRB500"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                        {doubleTask ? <div className="col-span-2 min-w-0 space-y-1.5 text-xs text-muted-foreground"><label htmlFor={`beam-${task}-compression-steel`}>受压钢筋等级</label><Select value={form.compressionSteel} onValueChange={(value) => update("compressionSteel", value)} disabled={loading}><SelectTrigger id={`beam-${task}-compression-steel`} className="h-11 rounded-xl border-border/60 bg-muted/50 shadow-none focus:ring-ring/25"><SelectValue /></SelectTrigger><SelectContent>{["HRB400", "HRB500"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div> : null}
                      </div>
                      {doubleTask ? <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">等级由后台映射为模型所需的强度设计值。受拉、受压钢筋可分别选择；本次实际采用的 fc、ft、fy、fy′ 将随结果显示。</p> : null}
                    </section>
                    <Separator className="bg-muted/50" />
                    <section className="kimi-beam-geometry space-y-3" aria-labelledby="beam-geometry-heading">
                      <h2 id="beam-geometry-heading" className="flex items-center gap-2 text-xs font-medium text-foreground"><Calculator className="size-3.5 text-foreground" aria-hidden />{doubleTask ? "受拉与受压钢筋位置" : task === "design" ? "有效高度与几何" : "实际有效高度与配筋"}</h2>
                      {task === "design" ? <details className="kimi-disclosure !border-0 !py-0"><summary className="text-sm"><span>调整有效高度与预估条件</span><ChevronDown aria-hidden /></summary><div className="mt-4 space-y-4">
                        <div className="space-y-1.5 text-xs text-muted-foreground"><label htmlFor="beam-geometry-mode">有效高度 h₀ 的来源</label><Select value={form.geometryMode} onValueChange={(value) => update("geometryMode", value)} disabled={loading}><SelectTrigger id="beam-geometry-mode" className="h-11 rounded-xl border-border/60 bg-muted/50 shadow-none focus:ring-ring/25"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="estimated">按单排钢筋预估 h₀</SelectItem><SelectItem value="direct">直接填写 h₀</SelectItem></SelectContent></Select></div>
                        {form.geometryMode === "estimated" ? <>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><label htmlFor="beam-environment">环境类别</label><Select value={form.environment} onValueChange={(value) => update("environment", value)} disabled={loading}><SelectTrigger id="beam-environment" className="h-11 rounded-xl border-border/60 bg-muted/50 shadow-none focus:ring-ring/25"><SelectValue /></SelectTrigger><SelectContent>{["I", "IIa", "IIb", "IIIa", "IIIb"].map((value) => <SelectItem key={value} value={value}>{value} 类</SelectItem>)}</SelectContent></Select></div>
                            <div className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><label htmlFor="beam-life">设计使用年限</label><Select value={form.life} onValueChange={(value) => update("life", value)} disabled={loading}><SelectTrigger id="beam-life" className="h-11 rounded-xl border-border/60 bg-muted/50 shadow-none focus:ring-ring/25"><SelectValue /></SelectTrigger><SelectContent>{["50", "100"].map((value) => <SelectItem key={value} value={value}>{value} 年</SelectItem>)}</SelectContent></Select></div>
                            <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>箍筋直径（mm）</span><Input type="number" inputMode="decimal" required min="0.01" step="any" value={form.stirrup} onChange={(event) => update("stirrup", event.target.value)} className="h-11 rounded-xl border-border/60 bg-muted/50 text-sm tabular-nums shadow-none focus-visible:ring-ring/25" /></label>
                            <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>预估纵筋直径（mm）</span><Input type="number" inputMode="decimal" required min="0.01" step="any" value={form.longitudinal} onChange={(event) => update("longitudinal", event.target.value)} className="h-11 rounded-xl border-border/60 bg-muted/50 text-sm tabular-nums shadow-none focus-visible:ring-ring/25" /></label>
                          </div>
                          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">h₀ 按保护层与单排钢筋几何规则计算，以服务返回值为准。100 年仅支持 I 类；IIIa、IIIb 分别要求至少 C35、C40。</p>
                        </> : <label className="block space-y-1.5 text-xs text-muted-foreground"><span>有效高度 h₀（mm）</span><Input type="number" inputMode="decimal" required min="0.01" step="any" value={form.h0} onChange={(event) => update("h0", event.target.value)} className="h-11 rounded-xl border-border/60 bg-muted/50 text-sm tabular-nums shadow-none focus-visible:ring-ring/25" /><span className="block text-xs leading-5 text-muted-foreground">受压边缘至受拉钢筋合力点的距离，应小于梁高。</span></label>}
                      </div></details> : doubleTask ? <>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>有效高度 h₀（mm）</span><Input name="h0" type="number" inputMode="decimal" required min="0.01" step="any" value={form.h0} onChange={(event) => update("h0", event.target.value)} className="h-11 rounded-xl border-border/60 bg-muted/50 text-sm tabular-nums shadow-none focus-visible:ring-ring/25" /></label>
                          <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>受压合力点距离 a′ₛ（mm）</span><Input name="aPrime" type="number" inputMode="decimal" required min="0.01" step="any" value={form.aPrime} onChange={(event) => update("aPrime", event.target.value)} className="h-11 rounded-xl border-border/60 bg-muted/50 text-sm tabular-nums shadow-none focus-visible:ring-ring/25" /></label>
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">h₀ 为受压边缘至受拉钢筋合力点的距离，a′ₛ 为受压边缘至受压钢筋合力点的距离。请明确填写，位置须满足 0 &lt; a′ₛ &lt; h₀ &lt; h；方法适用条件由后台继续检查。</p>
                        {task === "double-b" ? <label className="block space-y-1.5 text-xs text-muted-foreground"><span>给定受压钢筋面积 As′（mm²）</span><Input name="compressionArea" aria-label="给定受压钢筋面积 As′（mm²）" aria-describedby="beam-compression-help" type="number" inputMode="decimal" required min="0" step="any" value={form.compressionArea} onChange={(event) => update("compressionArea", event.target.value)} className="h-11 rounded-xl border-border/60 bg-muted/50 text-sm tabular-nums shadow-none focus-visible:ring-ring/25" /><span id="beam-compression-help" className="block text-xs leading-5 text-muted-foreground">该面积作为已知输入，本任务只预测所需受拉面积。</span></label> : <p className="text-xs leading-5 text-foreground">本任务的受拉、受压面积均为未知量，由双筋 A 模型分别预测。</p>}
                      </> : <div className="grid gap-3 sm:grid-cols-2">
                        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>实际有效高度 h₀（mm）</span><Input type="number" inputMode="decimal" required min="0.01" step="any" value={form.h0} onChange={(event) => update("h0", event.target.value)} className="h-11 rounded-xl border-border/60 bg-muted/50 text-sm tabular-nums shadow-none focus-visible:ring-ring/25" /></label>
                        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>实配钢筋面积 As（mm²）</span><Input type="number" inputMode="decimal" required min="0.01" step="any" value={form.area} onChange={(event) => update("area", event.target.value)} className="h-11 rounded-xl border-border/60 bg-muted/50 text-sm tabular-nums shadow-none focus-visible:ring-ring/25" /></label>
                      </div>}
                    </section>
                    <Separator className="bg-muted/50" />
                    <section className="space-y-3" aria-labelledby="beam-demand-heading">
                      <h2 id="beam-demand-heading" className="flex items-center gap-2 text-xs font-medium text-foreground"><ArrowRight className="size-3.5 text-foreground" aria-hidden />弯矩需求</h2>
                      <label className="block space-y-1.5 text-xs text-muted-foreground"><span>设计弯矩 M（kN·m）{task === "review" ? " · 可选" : ""}</span><Input type="number" inputMode="decimal" required={task !== "review"} min="0" step="any" value={form.moment} placeholder={task === "review" ? "留空则只计算承载力" : undefined} onChange={(event) => update("moment", event.target.value)} className="h-11 rounded-xl border-border/60 bg-muted/50 text-sm tabular-nums shadow-none focus-visible:ring-ring/25" /></label>
                    </section>
                    <div className="kimi-beam-submit flex flex-wrap gap-2 border-t border-border/60 pt-4">
                      <Button type="submit" disabled={loading} className="rounded-full h-10 flex-1 gap-2 bg-primary px-4 text-sm shadow-none hover:bg-primary sm:flex-none sm:px-6">{loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}{loading ? "正在调用模型…" : error ? "修改后重试" : "开始计算"}</Button>
                      <Button type="button" variant="outline" onClick={resetExample} disabled={loading} className="rounded-full h-10 gap-2 border-border/60 text-xs text-muted-foreground shadow-none"><RotateCcw className="size-3.5" aria-hidden />载入示例</Button>
                    </div>
                  </fieldset>
                  {loading ? <Button type="button" variant="ghost" className="mt-3 rounded-full" onClick={() => controller.current?.abort()}>取消计算</Button> : null}
                </form>
                {error ? <div role="alert" className="mt-4 space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-xs leading-6 text-destructive"><p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 shrink-0" aria-hidden />本次计算未完成</p><p className="break-words">{error}</p><p className="text-xs">输入已保留，可以修改后重试。</p></div> : null}
              </CardContent>
            </Card>

            <div ref={resultRef} tabIndex={-1} className="min-w-0 space-y-4 outline-none" aria-label="计算结果" aria-live="polite" aria-busy={loading}>
              {loading ? <Card className="rounded-[20px] border-border/60 bg-card shadow-none "><CardContent className="flex min-h-80 flex-col items-center justify-center gap-4 p-6 text-center"><div className="flex size-14 items-center justify-center rounded-[20px] bg-muted/50"><LoaderCircle className="size-6 animate-spin text-foreground" aria-hidden /></div><p className="text-sm font-medium text-foreground">{doubleTask ? "正在执行规则检查与双筋面积预测…" : "正在执行规则检查、分类与数值预测…"}</p><p className="text-xs leading-5 text-muted-foreground">计算完成后，模型值与公式参考将在这里并列显示。</p></CardContent></Card> : null}
              {!result && !loading ? <Card className="overflow-hidden rounded-[20px] border-border/60 bg-card shadow-none ">
                <CardHeader className="space-y-2 px-5 pb-0 pt-5"><div className="flex items-center gap-2 text-xs font-medium tracking-normal text-foreground"><span className="size-1.5 rounded-full bg-primary" />实验预览</div><CardTitle className="text-lg font-medium tracking-tight text-foreground">{edited ? "参数已变更，请重新计算" : "从一个梁截面开始"}</CardTitle><CardDescription className="text-xs leading-5 text-muted-foreground">{edited ? "上一次结果已清除，页面只展示与当前提交参数对应的结果。" : "填写截面条件，计算后查看模型与公式对照。"}</CardDescription></CardHeader>
                <CardContent className="px-5 pb-5"><details className="kimi-disclosure !border-0 !pb-0"><summary>查看截面示意<ChevronDown aria-hidden /></summary>
                  <figure className="mt-5 rounded-xl border border-border/60 bg-muted/50 px-2 pb-3 pt-2">
                    <svg viewBox="0 0 360 260" role="img" aria-label={`矩形梁截面概念示意：b为梁宽，h为梁高，h₀为受压边缘至受拉钢筋合力位置的距离。${doubleTask ? "a′ₛ为受压边缘至受压钢筋合力位置的距离。" : ""}图中位置固定，不表示实际配筋排布。`} className="mx-auto block h-auto w-full max-w-[340px] text-muted-foreground">
                      <rect x="116" y="34" width="126" height="164" rx="2" fill="var(--kimi-surface)" stroke="var(--kimi-text-secondary)" strokeWidth="1.5" />
                      <rect x="116" y="34" width="126" height="30" fill="var(--kimi-fill-selected)" />
                      <line x1="116" y1="64" x2="242" y2="64" stroke="var(--kimi-separator)" strokeDasharray="4 4" />
                      <line x1="116" y1="170" x2="242" y2="170" stroke="var(--kimi-text-secondary)" strokeDasharray="4 4" opacity="0.6" />
                      <circle cx="179" cy="170" r="7" fill="var(--kimi-text-primary)" />
                      <circle cx="179" cy="170" r="12" fill="none" stroke="var(--kimi-separator)" strokeWidth="1" />
                      {doubleTask ? <><circle cx="179" cy="64" r="7" fill="var(--kimi-text-primary)" /><text x="179" y="86" textAnchor="middle" fill="var(--kimi-text-primary)" fontSize="10">受压钢筋合力位置</text><line x1="212" y1="34" x2="212" y2="64" stroke="var(--kimi-text-primary)" /><text x="218" y="54" fill="var(--kimi-text-primary)" fontSize="11">a′ₛ</text></> : null}
                      <line x1="105" y1="34" x2="80" y2="34" stroke="var(--kimi-separator)" /><line x1="105" y1="198" x2="80" y2="198" stroke="var(--kimi-separator)" />
                      <line x1="88" y1="34" x2="88" y2="198" stroke="var(--kimi-separator)" /><line x1="84" y1="38" x2="92" y2="30" stroke="var(--kimi-separator)" /><line x1="84" y1="202" x2="92" y2="194" stroke="var(--kimi-separator)" />
                      <text x="67" y="121" fill="var(--kimi-text-secondary)" fontSize="13">h</text>
                      <line x1="116" y1="211" x2="116" y2="234" stroke="var(--kimi-separator)" /><line x1="242" y1="211" x2="242" y2="234" stroke="var(--kimi-separator)" />
                      <line x1="116" y1="225" x2="242" y2="225" stroke="var(--kimi-separator)" /><line x1="112" y1="229" x2="120" y2="221" stroke="var(--kimi-separator)" /><line x1="238" y1="229" x2="246" y2="221" stroke="var(--kimi-separator)" />
                      <text x="175" y="248" fill="var(--kimi-text-secondary)" fontSize="13">b</text>
                      <line x1="252" y1="34" x2="279" y2="34" stroke="var(--kimi-text-secondary)" opacity="0.6" /><line x1="252" y1="170" x2="279" y2="170" stroke="var(--kimi-text-secondary)" opacity="0.6" />
                      <line x1="270" y1="34" x2="270" y2="170" stroke="var(--kimi-text-secondary)" /><line x1="266" y1="38" x2="274" y2="30" stroke="var(--kimi-text-secondary)" /><line x1="266" y1="174" x2="274" y2="166" stroke="var(--kimi-text-secondary)" />
                      <text x="281" y="107" fill="var(--kimi-text-primary)" fontSize="13">h₀</text>
                      <text x="179" y="151" textAnchor="middle" fill="var(--kimi-text-primary)" fontSize="10">受拉钢筋合力位置</text>
                    </svg>
                    <figcaption className="text-center text-xs leading-5 text-muted-foreground">概念示意，非实际排布 · 图形不随输入按比例绘制</figcaption>
                  </figure>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="min-w-0 rounded-lg bg-muted/50 px-1 py-2"><dt className="text-xs text-muted-foreground">梁宽 b</dt><dd className="mt-1 break-words text-xs font-medium tabular-nums text-foreground">{form.b || "—"}<span className="ml-1 text-xs font-normal text-muted-foreground">mm</span></dd></div><div className="min-w-0 rounded-lg bg-muted/50 px-1 py-2"><dt className="text-xs text-muted-foreground">梁高 h</dt><dd className="mt-1 break-words text-xs font-medium tabular-nums text-foreground">{form.h || "—"}<span className="ml-1 text-xs font-normal text-muted-foreground">mm</span></dd></div><div className="min-w-0 rounded-lg bg-muted/50 px-1 py-2"><dt className="text-xs text-foreground">有效高度 h₀</dt><dd className="mt-1 break-words text-xs font-medium tabular-nums text-foreground">{task === "design" && form.geometryMode === "estimated" ? "待计算" : <>{form.h0 || "—"}<span className="ml-1 text-xs font-normal text-foreground">mm</span></>}</dd></div></dl>
                  <p className="mt-4 text-xs leading-6 text-muted-foreground">{doubleTask ? `受压合力点距离 a′ₛ = ${form.aPrime || "—"} mm。${task === "double-a" ? "分别预测受拉与受压面积。" : "受压面积采用给定输入，仅预测受拉面积。"}双筋模型与原有单筋分类 A/B 是不同任务。` : task === "design" ? "分类 A 判断弯矩需求对应的设计状态，不用于认定实配梁的少筋或超筋破坏。" : "分类 B 判断实际配筋所在区间；处于适筋范围后，还需要将承载力与设计弯矩比较。"}</p>
                </details></CardContent>
              </Card> : null}

              {result && isDoubleResult(result) ? <DoubleResults result={result} explain={explain} download={download} /> : null}
              {result && !isDoubleResult(result) ? <>
                <Card className="overflow-hidden rounded-[20px] border-border/60 bg-card shadow-none ">
                  <CardHeader className="space-y-3 border-b border-border/60 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium tracking-normal text-foreground">实验结果</p><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${result.status === "ok" ? "bg-muted/50 text-foreground" : "bg-amber-50 text-amber-800"}`}>{result.status === "ok" ? <CheckCircle2 className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}{STATUS_LABELS[result.status] ?? result.status}</span></div>
                    <CardTitle className="text-base font-medium text-foreground">{task === "design" ? "所需钢筋面积 As" : "抗弯承载力 Mu"}</CardTitle>
                    {reason ? <p className={`text-xs leading-5 ${result.status === "ok" ? "text-muted-foreground" : "text-amber-900"}`}>{reason}</p> : null}
                  </CardHeader>
                  <CardContent className="space-y-4 px-5 pb-5 pt-5">
                    <dl className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 min-[360px]:gap-3 sm:gap-5">
                      <div className="min-w-0"><dt className="text-xs font-medium text-foreground">模型预测</dt><dd className="mt-2 break-all text-[28px] font-medium leading-tight tracking-tight tabular-nums text-foreground sm:text-[34px]">{result.prediction ? beamNumber(result.prediction.value) : "暂不预测"}</dd><dd className="mt-1 text-xs text-muted-foreground">{result.prediction ? result.prediction.unit : "超出当前回归模型适用范围"}</dd></div>
                      <div className="min-w-0 border-t border-border/60 pt-4 min-[360px]:border-l min-[360px]:border-t-0 min-[360px]:pl-3 min-[360px]:pt-0 sm:pl-5"><dt className="text-xs font-medium text-muted-foreground">规范公式参考</dt><dd className="mt-2 break-all text-[28px] font-medium leading-tight tracking-tight tabular-nums text-foreground sm:text-[34px]">{beamNumber(referenceValue)}</dd><dd className="mt-1 text-xs text-muted-foreground">{typeof referenceValue === "number" ? unit : "当前条件无适用数值"}</dd></div>
                    </dl>
                    {!result.prediction ? <p className="rounded-lg bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-900">规则检查未允许调用当前回归模型。{reason || "请根据规则状态调整输入或设计方案。"}</p> : null}
                    {result.comparison ? <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 bg-muted/50 px-3.5 py-3"><div className="min-w-0"><dt className="text-xs leading-4 text-muted-foreground">预测 − 公式参考</dt><dd className="mt-1.5 break-words text-sm font-medium tabular-nums text-foreground">{result.comparison.model_minus_reference > 0 ? "+" : ""}{beamNumber(result.comparison.model_minus_reference)} <span className="text-xs font-normal text-muted-foreground">{unit}</span></dd></div><div className="min-w-0"><dt className="text-xs leading-4 text-muted-foreground">相对差值<span className="block text-xs text-muted-foreground">以公式参考为基准</span></dt><dd className="mt-1.5 text-sm font-medium tabular-nums text-foreground">{result.comparison.relative_error_percent > 0 ? "+" : ""}{beamNumber(result.comparison.relative_error_percent)}%</dd></div></dl> : null}
                    {result.reference.control === "minimum_reinforcement" ? <p className="text-xs leading-5 text-foreground">公式参考由最小配筋要求控制，选筋时应满足该下限。</p> : null}
                    {task === "review" && result.comparison && typeof result.comparison.reference_meets === "boolean" ? <div className="space-y-3"><dl className="grid grid-cols-2 gap-3 text-xs"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><dt className="text-muted-foreground">模型判断</dt><dd className={`font-medium ${result.comparison.model_meets ? "text-foreground" : "text-amber-800"}`}>{result.comparison.model_meets ? "满足" : "不满足"}</dd></div><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><dt className="text-muted-foreground">公式参考判断</dt><dd className={`font-medium ${result.comparison.reference_meets ? "text-foreground" : "text-amber-800"}`}>{result.comparison.reference_meets ? "满足" : "不满足"}</dd></div></dl>{result.comparison.decision_disagrees ? <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium leading-5 text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />模型与公式参考的满足判断不一致，请结合公式和边界条件复核。</p> : null}</div> : null}
                    {task === "review" && typeof result.inputs.M_design_kNm !== "number" ? <p className="text-xs leading-5 text-muted-foreground">未提供设计弯矩，本次仅计算承载力，不给出需求满足判断。</p> : null}
                    <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4"><Button type="button" variant="outline" size="sm" onClick={explain} className="rounded-full h-9 gap-2 border-border/60 bg-muted/50 text-xs text-foreground shadow-none hover:bg-muted/50"><MessageSquare className="size-3.5" aria-hidden />AI 讲解</Button><Button type="button" variant="ghost" size="sm" onClick={download} className="rounded-full h-9 gap-2 px-2 text-xs text-muted-foreground hover:bg-muted/50"><Download className="size-3.5" aria-hidden />下载结果 JSON</Button></div>
                    <p className="text-xs leading-5 text-muted-foreground">AI 讲解使用本次参数与计算结果；下载记录包含模型版本。</p>
                  </CardContent>
                </Card>

                {result.warnings.length ? <Card className="rounded-xl border-amber-200/80 bg-amber-50/50 shadow-none"><CardHeader className="px-4 pb-2 pt-3.5"><CardTitle className="flex items-center gap-2 text-xs font-medium text-amber-900"><AlertTriangle className="size-4 shrink-0" aria-hidden />本次适用性提示</CardTitle></CardHeader><CardContent className="px-4 pb-3.5"><ul className="list-disc space-y-1.5 pl-4 text-xs leading-5 text-amber-900/80">{result.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></CardContent></Card> : null}

                <Card className="rounded-[20px] border-border/60 bg-card shadow-none">
                  <CardHeader className="space-y-2 px-5 pb-3 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-sm font-medium text-foreground">{result.task === "design" ? "设计状态分类 A" : "实配配筋状态分类 B"}</CardTitle><span className="rounded-md bg-muted/50 px-2 py-1 text-xs font-medium text-foreground">{beamClassLabel(result.task, result.classification.class_name)}</span></div><CardDescription className="text-xs leading-5 text-muted-foreground">{result.task === "design" ? "判断弯矩需求对应的设计状态，不代表实配梁的破坏形态。" : "判断实际配筋区间；适筋类别本身不代表承载力满足。"}</CardDescription></CardHeader>
                  <CardContent className="space-y-3 px-5 pb-4"><dl className="space-y-3">{BEAM_CLASS_ORDER.map((name) => <div key={name}><div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs"><dt className={`min-w-0 ${name === result.classification.class_name ? "font-medium text-foreground" : "text-muted-foreground"}`}>{beamClassLabel(result.task, name)}</dt><dd className="shrink-0 tabular-nums text-muted-foreground">{beamNumber(result.classification.probabilities[name] * 100, 1)}%</dd></div><div className="h-1 overflow-hidden rounded-full bg-muted/50" aria-hidden><div className={`h-full rounded-full ${name === result.classification.class_name ? "bg-primary" : "bg-muted/50"}`} style={{ width: `${Math.max(0, Math.min(100, result.classification.probabilities[name] * 100))}%` }} /></div></div>)}</dl><p className="pt-1 text-xs leading-5 text-muted-foreground">模型分类概率 · 不代表规范验算置信度</p></CardContent>
                </Card>

                <Card className="overflow-hidden rounded-xl border-border/60 bg-card shadow-none"><details className="group"><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden"><span>计算依据与记录<span className="ml-2 text-xs font-normal text-muted-foreground">输入与公式中间量</span></span><ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden /></summary><CardContent className="space-y-4 border-t border-border/60 px-5 pb-5 pt-4"><p className="text-xs leading-5 text-muted-foreground">有效高度 h₀ = <span className="font-medium tabular-nums text-foreground">{beamNumber(result.geometry.h0_mm)} mm</span> · {GEOMETRY_BASIS_LABELS[result.geometry.basis] ?? result.geometry.basis}</p>
                  <dl className="grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">{Object.entries(result.inputs).filter(([key, value]) => key in INPUT_LABELS && (typeof value === "string" || typeof value === "number")).map(([key, value]) => <div key={key} className="flex justify-between gap-3"><dt className="text-muted-foreground">{INPUT_LABELS[key]}</dt><dd className="break-words text-right tabular-nums text-foreground">{String(value)}</dd></div>)}</dl>
                  <Separator className="bg-muted/50" />
                  <dl className="grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">{Object.entries(result.reference).filter(([key, value]) => key in REFERENCE_LABELS && typeof value === "number" && Number.isFinite(value)).map(([key, value]) => <div key={key} className="flex justify-between gap-3"><dt className="text-muted-foreground">{REFERENCE_LABELS[key]}</dt><dd className="shrink-0 text-right tabular-nums text-foreground">{beamNumber(value, ["rho", "rho_min", "xi", "xi_b", "xi_required", "rho_given_gross", "rho_required_gross", "xi_yield_assumed"].includes(key) ? 4 : 2)}</dd></div>)}</dl>
                  <p className="text-xs leading-5 text-muted-foreground">{result.scope}</p>
                </CardContent></details></Card>
              </> : null}
            </div>
          </div>
          <p className="max-w-3xl text-xs leading-5 text-muted-foreground">适用于当前训练和规则覆盖的普通非抗震、非预应力受弯任务。模型预测与公式参考应结合适用条件理解。</p>
        </main>
      </div>
      {active ? <AiSidePanel /> : null}
    </div>
  );
}
