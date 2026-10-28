import "server-only";
import { z } from "zod";
import { readJson, RequestValidationError } from "./request-validation";
import type { BeamTask } from "./beam-types";

const positive = z.number().finite().positive();
const nonnegative = z.number().finite().nonnegative();
const shared = {
  b_mm: positive,
  h_mm: positive,
  concrete: z.enum(["C30", "C35", "C40"]),
  steel: z.enum(["HRB400", "HRB500"]),
};
export const BeamDesignSchema = z.object({
  ...shared,
  M_design_kNm: nonnegative,
  h0_mm: positive.nullish(),
  environment_class: z.enum(["I", "IIa", "IIb", "IIIa", "IIIb"]).optional(),
  design_life_years: z.union([z.literal(50), z.literal(100)]).optional(),
  stirrup_d_mm: positive.optional(),
  assumed_longitudinal_d_mm: positive.optional(),
}).strict();
export const BeamReviewSchema = z.object({
  ...shared,
  h0_mm: positive,
  As_provided_mm2: nonnegative,
  M_design_kNm: nonnegative.nullish(),
}).strict();
const doubleFields = {
  ...shared,
  h0_mm: positive,
  as_prime_mm: positive,
  compression_steel: z.enum(["HRB400", "HRB500"]),
  M_design_kNm: nonnegative,
};
export const BeamDoubleASchema = z.object(doubleFields).strict();
export const BeamDoubleBSchema = z.object({ ...doubleFields, Asp_given_mm2: nonnegative }).strict();
const REQUEST_SCHEMAS = { design: BeamDesignSchema, review: BeamReviewSchema, "double-a": BeamDoubleASchema, "double-b": BeamDoubleBSchema };

const probability = z.number().finite().min(0).max(1);
const SingleResultSchema = z.object({
  task: z.enum(["design", "review"]),
  status: z.string(),
  inputs: z.record(z.unknown()),
  geometry: z.object({ h0_mm: positive, basis: z.string() }).passthrough(),
  classification: z.object({
    class_name: z.enum(["少筋", "适筋", "超筋"]),
    label: z.string(),
    probabilities: z.object({ 少筋: probability, 适筋: probability, 超筋: probability }),
  }).passthrough(),
  prediction: z.object({ value: positive, unit: z.enum(["mm²", "kN·m"]), model_key: z.string() }).nullable(),
  reference: z.record(z.unknown()),
  comparison: z.object({
    model_minus_reference: z.number().finite(),
    relative_error_percent: z.number().finite(),
    model_meets: z.boolean().optional(),
    reference_meets: z.boolean().optional(),
    decision_disagrees: z.boolean().optional(),
  }).nullable(),
  warnings: z.array(z.string()),
  model_versions: z.record(z.string()),
  scope: z.string(),
}).passthrough();

const doublePrediction = z.object({ value: z.number().finite(), unit: z.literal("mm²"), model_key: z.string() }).strict();
const doubleComparison = z.object({ model_minus_reference: z.number().finite(), relative_error_percent: z.number().finite().nullable() }).strict();
const DoubleResultSchema = z.object({
  task: z.enum(["double-a", "double-b"]),
  status: z.string(),
  inputs: z.record(z.unknown()),
  materials: z.object({ fc_MPa: positive, ft_MPa: positive, fy_MPa: positive, fyp_MPa: positive, Es_MPa: positive }),
  geometry: z.object({ h0_mm: positive, as_prime_mm: positive, basis: z.string() }).passthrough(),
  classification: z.null(), prediction: z.null(), comparison: z.null(),
  model_called: z.boolean(),
  predictions: z.object({ As_required_mm2: doublePrediction, Asp_required_mm2: doublePrediction.optional() }).strict().nullable(),
  comparisons: z.object({ As_required_mm2: doubleComparison, Asp_required_mm2: doubleComparison.optional() }).strict().nullable(),
  reference: z.record(z.unknown()),
  prediction_review: z.object({
    status: z.string(), reason: z.string().optional(), Mu_kNm: z.number().finite().optional(),
    capacity_margin_kNm: z.number().finite().nullable().optional(), minimum_area_meets: z.boolean().optional(),
    numerical_checks_passed: z.boolean().optional(),
    ultimate_strain_full_analysis_performed: z.literal(false).optional(),
  }).passthrough().nullable(),
  warnings: z.array(z.string()), model_versions: z.record(z.string()), scope: z.string(),
}).passthrough().superRefine((result, context) => {
  if (result.model_called !== (result.predictions !== null)
    || result.model_called !== (result.comparisons !== null)
    || result.model_called !== (result.prediction_review !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "双筋模型调用状态与结果不一致" });
  }
  if (result.predictions && result.comparisons) {
    const hasCompression = result.predictions.Asp_required_mm2 !== undefined && result.comparisons.Asp_required_mm2 !== undefined;
    if ((result.task === "double-a" && !hasCompression)
      || (result.task === "double-b" && (result.predictions.Asp_required_mm2 !== undefined || result.comparisons.Asp_required_mm2 !== undefined))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "双筋预测目标与任务不一致" });
    }
  }
});
const ResultSchema = z.union([SingleResultSchema, DoubleResultSchema]);

const reply = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

function serviceUrl(operation: BeamTask | "health"): URL {
  const base = new URL((process.env.BEAM_SERVICE_URL || "http://127.0.0.1:8001").replace(/\/+$/, "") + "/");
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error("Invalid beam service configuration");
  }
  const style = process.env.BEAM_SERVICE_API_STYLE || "python";
  if (style !== "python" && style !== "web") throw new Error("Invalid beam service API style");
  return new URL(operation === "health" || style === "web" ? operation : `v1/${operation}`, base);
}

function detailMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "参数不符合模型要求，请检查输入。";
  const body = data as Record<string, unknown>;
  if (typeof body.error === "string") return body.error.slice(0, 600);
  if (typeof body.detail === "string") return body.detail.slice(0, 600);
  if (Array.isArray(body.detail)) {
    const messages = body.detail.slice(0, 3).map(item => {
      const issue = item as { msg?: unknown; loc?: unknown };
      return typeof issue?.msg === "string" ? issue.msg : "参数无效";
    });
    return messages.join("；").slice(0, 600);
  }
  return "参数不符合模型要求，请检查输入。";
}

async function readServiceJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty service response");
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 262_144) throw new Error("Service response too large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export async function beamProxy(req: Request, operation: BeamTask) {
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return reply({ error: "请使用 JSON 提交截面参数。" }, 415);
  }
  let body;
  try { body = await readJson(req, REQUEST_SCHEMAS[operation], 16_384); }
  catch (error) {
    if (error instanceof RequestValidationError) return reply({ error: error.message }, error.status);
    return reply({ error: "请求已取消，请重新提交。" }, 408);
  }
  try {
    const response = await fetch(serviceUrl(operation), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(15_000)]),
      cache: "no-store",
      redirect: "error",
    });
    const data = await readServiceJson(response);
    if (!response.ok) {
      return [400, 413, 415, 422].includes(response.status)
        ? reply({ error: detailMessage(data) }, response.status)
        : reply({ error: "模型服务暂时不可用，请稍后重试。" }, 503);
    }
    const parsed = ResultSchema.safeParse(data);
    if (!parsed.success || parsed.data.task !== operation) return reply({ error: "模型结果格式异常，请联系管理员。" }, 502);
    return reply(parsed.data);
  } catch {
    return reply({ error: req.signal.aborted ? "请求已取消。" : "暂时无法连接模型服务，请确认推理服务已启动后重试。" }, req.signal.aborted ? 408 : 503);
  }
}

export async function beamHealth(req: Request) {
  try {
    const response = await fetch(serviceUrl("health"), {
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(5_000)]), cache: "no-store", redirect: "error",
    });
    if (!response.ok) throw new Error("Unavailable");
    const data = await readServiceJson(response);
    return reply(data);
  } catch { return reply({ error: "模型服务未就绪。" }, 503); }
}
