export type BeamSingleTask = "design" | "review";
export type BeamDoubleTask = "double-a" | "double-b";
export type BeamTask = BeamSingleTask | BeamDoubleTask;

export type BeamClassName = "少筋" | "适筋" | "超筋";

export type BeamDesignRequest = {
  b_mm: number;
  h_mm: number;
  concrete: string;
  steel: string;
  M_design_kNm: number;
  h0_mm?: number;
  environment_class?: string;
  design_life_years?: number;
  stirrup_d_mm?: number;
  assumed_longitudinal_d_mm?: number;
};

export type BeamReviewRequest = {
  b_mm: number;
  h_mm: number;
  h0_mm: number;
  concrete: string;
  steel: string;
  As_provided_mm2: number;
  M_design_kNm?: number;
};

export type BeamDoubleRequest = {
  b_mm: number;
  h_mm: number;
  h0_mm: number;
  as_prime_mm: number;
  concrete: string;
  steel: string;
  compression_steel: string;
  M_design_kNm: number;
  Asp_given_mm2?: number;
};

export type BeamSingleResult = {
  task: BeamSingleTask;
  status: string;
  inputs: Record<string, unknown>;
  geometry: { h0_mm: number; basis: string; [key: string]: unknown };
  classification: {
    class_name: BeamClassName;
    label: string;
    probabilities: Record<BeamClassName, number>;
  };
  prediction: {
    value: number;
    unit: "mm²" | "kN·m";
    model_key: string;
  } | null;
  reference: Record<string, unknown>;
  comparison: {
    model_minus_reference: number;
    relative_error_percent: number;
    model_meets?: boolean;
    reference_meets?: boolean;
    decision_disagrees?: boolean;
  } | null;
  warnings: string[];
  model_versions: Record<string, string>;
  scope: string;
};

export type BeamDoublePrediction = { value: number; unit: "mm²"; model_key: string };
export type BeamDoubleComparison = { model_minus_reference: number; relative_error_percent: number | null };
export type BeamDoubleResult = {
  task: BeamDoubleTask;
  status: string;
  inputs: Record<string, unknown>;
  materials: { fc_MPa: number; ft_MPa: number; fy_MPa: number; fyp_MPa: number; Es_MPa: number };
  geometry: { h0_mm: number; as_prime_mm: number; basis: string; [key: string]: unknown };
  classification: null;
  prediction: null;
  comparison: null;
  model_called: boolean;
  predictions: { As_required_mm2: BeamDoublePrediction; Asp_required_mm2?: BeamDoublePrediction } | null;
  comparisons: { As_required_mm2: BeamDoubleComparison; Asp_required_mm2?: BeamDoubleComparison } | null;
  reference: Record<string, unknown>;
  prediction_review: {
    status: string;
    reason?: string;
    Mu_kNm?: number;
    capacity_margin_kNm?: number | null;
    minimum_area_meets?: boolean;
    numerical_checks_passed?: boolean;
    x_mm?: number;
    xi?: number;
    sigma_c_prime_MPa?: number;
    epsilon_t?: number;
    epsilon_c_prime?: number;
    tension_yielded?: boolean;
    compression_yielded?: boolean;
    equivalent_state_exceeds_steel_ultimate_strain?: boolean;
    ultimate_strain_full_analysis_performed?: boolean;
    [key: string]: unknown;
  } | null;
  warnings: string[];
  model_versions: Record<string, string>;
  scope: string;
};

export type BeamResult = BeamSingleResult | BeamDoubleResult;

export function isDoubleTask(task: BeamTask): task is BeamDoubleTask {
  return task === "double-a" || task === "double-b";
}

export const BEAM_CLASS_ORDER: BeamClassName[] = ["少筋", "适筋", "超筋"];

/** 分类 A 的训练简称描述设计需求，不代表一根实配梁的破坏形态。 */
export const BEAM_DESIGN_CLASS_LABELS: Record<BeamClassName, string> = {
  少筋: "最小配筋控制",
  适筋: "正常单筋设计",
  超筋: "超过单筋设计限值",
};

export const BEAM_REVIEW_CLASS_LABELS: Record<BeamClassName, string> = {
  少筋: "实配面积低于最小配筋",
  适筋: "实配面积处于适筋范围",
  超筋: "超过单筋简式界限",
};

export function beamClassLabel(task: BeamSingleTask, name: BeamClassName): string {
  return (task === "design" ? BEAM_DESIGN_CLASS_LABELS : BEAM_REVIEW_CLASS_LABELS)[name] ?? name;
}

export function beamNumber(value: unknown, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: digits })
    : "—";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 防止代理的非 JSON 错误或不完整响应在结果视图中产生未捕获异常。 */
export function isBeamResult(value: unknown): value is BeamResult {
  if (!isRecord(value)) return false;
  if (!["design", "review", "double-a", "double-b"].includes(value.task as string)) return false;
  if (typeof value.status !== "string" || typeof value.scope !== "string") return false;
  if (!isRecord(value.inputs) || !isRecord(value.reference) || !isRecord(value.geometry)) return false;
  if (!Number.isFinite(value.geometry.h0_mm) || typeof value.geometry.basis !== "string") return false;
  if (!Array.isArray(value.warnings) || !value.warnings.every((warning) => typeof warning === "string")) return false;
  if (!isRecord(value.model_versions) || !Object.values(value.model_versions).every(version => typeof version === "string")) return false;
  if (value.task === "double-a" || value.task === "double-b") {
    if (value.classification !== null || value.prediction !== null || value.comparison !== null || typeof value.model_called !== "boolean") return false;
    if (!Number.isFinite(value.geometry.as_prime_mm) || !isRecord(value.materials)) return false;
    if (!["fc_MPa", "ft_MPa", "fy_MPa", "fyp_MPa", "Es_MPa"].every(key => typeof value.materials === "object" && value.materials !== null && Number.isFinite((value.materials as Record<string, unknown>)[key]))) return false;
    if (!value.model_called) return value.predictions === null && value.comparisons === null && value.prediction_review === null;
    if (!isRecord(value.predictions) || !isRecord(value.comparisons) || !isRecord(value.prediction_review) || typeof value.prediction_review.status !== "string") return false;
    const expectedTargets = value.task === "double-a" ? ["As_required_mm2", "Asp_required_mm2"] : ["As_required_mm2"];
    if (Object.keys(value.predictions).length !== expectedTargets.length || Object.keys(value.comparisons).length !== expectedTargets.length) return false;
    return expectedTargets.every(target => {
      const prediction = (value.predictions as Record<string, unknown>)[target];
      const comparison = (value.comparisons as Record<string, unknown>)[target];
      return isRecord(prediction) && typeof prediction.value === "number" && Number.isFinite(prediction.value) && prediction.unit === "mm²" && typeof prediction.model_key === "string"
        && isRecord(comparison) && typeof comparison.model_minus_reference === "number" && Number.isFinite(comparison.model_minus_reference)
        && (comparison.relative_error_percent === null || (typeof comparison.relative_error_percent === "number" && Number.isFinite(comparison.relative_error_percent)));
    });
  }
  if (!isRecord(value.classification) || !isRecord(value.classification.probabilities)) return false;
  if (!BEAM_CLASS_ORDER.includes(value.classification.class_name as BeamClassName)) return false;
  const probabilities = value.classification.probabilities;
  if (!BEAM_CLASS_ORDER.every((name) => typeof probabilities[name] === "number" && Number.isFinite(probabilities[name]))) return false;
  if (value.prediction !== null && (!isRecord(value.prediction) || typeof value.prediction.value !== "number" || !Number.isFinite(value.prediction.value) || !["mm²", "kN·m"].includes(value.prediction.unit as string) || typeof value.prediction.model_key !== "string")) return false;
  if (value.comparison !== null && !isRecord(value.comparison)) return false;
  return true;
}

export function beamErrorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    if (typeof body.error === "string") return body.error;
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      const messages = body.detail.flatMap((item) => {
        if (!isRecord(item) || typeof item.msg !== "string") return [];
        const field = Array.isArray(item.loc) ? item.loc.filter((part) => part !== "body").join(".") : "";
        return [field ? `${field}：${item.msg}` : item.msg];
      });
      if (messages.length) return messages.join("；");
    }
  }
  return status === 422 ? "输入参数不符合当前模型的适用条件，请检查并修改。" : `计算请求失败（HTTP ${status}），请稍后重试。`;
}
