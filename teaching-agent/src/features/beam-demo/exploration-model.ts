/** Fixed teaching example supplied in 构知教学创新网页.html; not a general design solver. */
export const EXAMPLE = {
  width: 250, height: 500, effectiveHeight: 460,
  alpha1: 1, concreteStrength: 14.3, steelStrength: 360,
  limitXi: .518, minimumSteel: 250, minArea: 100, maxArea: 3000, step: 10,
} as const;
export const STEEL_PRESETS = [
  { area: 150, label: "少筋情境" }, { area: 950, label: "适筋情境" }, { area: 2800, label: "超筋情境" },
] as const;
export function evaluateSectionExample(area: number) {
  if (!Number.isFinite(area) || area < EXAMPLE.minArea || area > EXAMPLE.maxArea) throw new Error("钢筋面积超出演示范围");
  const x = EXAMPLE.steelStrength * area / (EXAMPLE.alpha1 * EXAMPLE.concreteStrength * EXAMPLE.width);
  const xi = x / EXAMPLE.effectiveHeight;
  const kind = area < EXAMPLE.minimumSteel ? "low" : xi > EXAMPLE.limitXi ? "high" : "normal";
  return {
    area, x, xi, kind,
    label: kind === "low" ? "少筋情境" : kind === "high" ? "超筋情境" : "适筋范围",
    moment: kind === "normal" ? EXAMPLE.steelStrength * area * (EXAMPLE.effectiveHeight - x / 2) / 1e6 : null,
    compressionHeight: Math.min(210, x / EXAMPLE.height * 210),
    barRadius: Math.min(13, Math.max(3, Math.sqrt(area) / 4)),
    explanation: kind === "low"
      ? "低于本例给定的最小配筋面积。先分析开裂后的受力过程，不能直接将适筋公式的结果作为承载力。"
      : kind === "high"
        ? "按钢筋屈服假定求得的 ξ 超过界限。该假定不成立，应调整方案或重新处理模型。"
        : "满足本例给定的适筋条件。增加钢筋面积也会改变受压区高度与内力臂，承载力不会简单成比例增长。",
  };
}
export type AuditAnswer = "yes" | "no" | null;
export const AUDIT_STATEMENT = "所选钢筋的正截面受弯承载力大于弯矩设计值，因此整根梁的全部设计要求均已满足。";
export function auditFeedback(answer: AuditAnswer) {
  if (answer === null) return null;
  return answer === "no"
    ? "判断正确。正截面受弯通过只支持该项核验；还需按任务范围检查受剪、裂缝、挠度、锚固及构造要求。"
    : "请重新检查结论范围：一项承载力核验不能证明全部设计要求满足。受剪、正常使用及构造要求仍需分别验证。";
}
