export type BeamKind = "single" | "double";
export type CaseId = "single-normal" | "single-low" | "single-high" | "double-yield" | "double-elastic";
export type DiagramView = "beam" | "section";
export type Stage = { at: number; label: string; explanation: string };
export type BeamCase = {
  id: CaseId; kind: BeamKind; label: string; duration: number; tensionYieldAt: number | null;
  compressionYieldAt: number | null; crackAt: number; maxSag: number; neutralDepth: number;
  bars: number; stages: readonly Stage[];
};
export const BEAM_CASES: readonly BeamCase[] = [
  { id: "single-normal", kind: "single", label: "适筋梁", duration: 12, tensionYieldAt: .68, compressionYieldAt: null, crackAt: .27, maxSag: 54, neutralDepth: .34, bars: 3,
    stages: [
      { at: 0, label: "未开裂", explanation: "加载初期，混凝土和受拉钢筋共同工作，变形较小。" },
      { at: .27, label: "混凝土开裂", explanation: "受拉区出现裂缝，钢筋承担主要拉力，裂缝继续发展。" },
      { at: .68, label: "钢筋屈服", explanation: "受拉钢筋先屈服，随后仍有明显的变形发展过程。" },
      { at: 1, label: "混凝土压碎", explanation: "受压区混凝土最终压碎。受拉钢筋先屈服、混凝土后压碎。" },
    ] },
  { id: "single-low", kind: "single", label: "少筋梁", duration: 8, tensionYieldAt: .46, compressionYieldAt: null, crackAt: .45, maxSag: 43, neutralDepth: .18, bars: 2,
    stages: [
      { at: 0, label: "未开裂", explanation: "开裂前，混凝土尚承担拉力，钢筋数量较少。" },
      { at: .45, label: "混凝土开裂", explanation: "开裂后，受拉区混凝土释放的拉力使钢筋应力迅速增加。" },
      { at: .47, label: "迅速失效", explanation: "受拉钢筋很快屈服，主要裂缝迅速张开，缺少稳定的延性发展过程。" },
      { at: 1, label: "少筋破坏", explanation: "重点看开裂与迅速失效紧接发生。本演示把这个短过程放慢展示。" },
    ] },
  { id: "single-high", kind: "single", label: "超筋梁", duration: 10, tensionYieldAt: null, compressionYieldAt: null, crackAt: .3, maxSag: 24, neutralDepth: .64, bars: 5,
    stages: [
      { at: 0, label: "未开裂", explanation: "受拉钢筋较多，但配筋更多并不意味着破坏过程更有延性。" },
      { at: .3, label: "混凝土开裂", explanation: "受拉区开裂，受压区逐渐接近极限状态。" },
      { at: .68, label: "压区发展", explanation: "受拉钢筋仍未屈服，受压区混凝土已接近极限状态。" },
      { at: 1, label: "混凝土先压碎", explanation: "受压区混凝土先压碎，受拉钢筋未屈服，缺少充分的变形预兆。" },
    ] },
  { id: "double-yield", kind: "double", label: "受压筋充分发挥", duration: 12, tensionYieldAt: .68, compressionYieldAt: .78, crackAt: .27, maxSag: 54, neutralDepth: .45, bars: 3,
    stages: [
      { at: 0, label: "未开裂", explanation: "受拉、受压两侧均配置参与受弯的纵向钢筋。" },
      { at: .27, label: "混凝土开裂", explanation: "受拉区开裂，受拉钢筋承担主要拉力；受压钢筋协助混凝土受压。" },
      { at: .68, label: "钢筋屈服", explanation: "本情形中受拉钢筋先屈服，继续发展后受压钢筋也达到屈服状态。" },
      { at: 1, label: "混凝土压碎", explanation: "本情形的受压钢筋已充分发挥抗压作用，随后受压区混凝土达到极限。" },
    ] },
  { id: "double-elastic", kind: "double", label: "受压筋未屈服", duration: 12, tensionYieldAt: .68, compressionYieldAt: null, crackAt: .27, maxSag: 50, neutralDepth: .25, bars: 3,
    stages: [
      { at: 0, label: "未开裂", explanation: "双筋截面配置了受压钢筋，但配置受压筋不代表它必然屈服。" },
      { at: .27, label: "混凝土开裂", explanation: "关注受压钢筋的位置和应变。它的应变随截面变形发展。" },
      { at: .68, label: "受拉筋屈服", explanation: "本情形的受拉钢筋已屈服，受压钢筋应变仍不足以达到屈服。" },
      { at: 1, label: "混凝土压碎", explanation: "本情形中受压钢筋仍未屈服，不能直接把它的应力当作抗压屈服强度。" },
    ] },
];
export const DEFAULT_BEAM_CASE: CaseId = "single-normal";
export const getBeamCase = (id: CaseId): BeamCase => {
  const item = BEAM_CASES.find(item => item.id === id);
  if (!item) throw new Error("未知演示情形");
  return item;
};
export const casesForKind = (kind: BeamKind) => BEAM_CASES.filter(item => item.kind === kind);
export function clampProgress(value: number) {
  if (!Number.isFinite(value)) throw new Error("演示进度无效");
  return Math.min(1, Math.max(0, value));
}
export function getBeamFrame(id: CaseId, rawProgress: number) {
  const item = getBeamCase(id);
  const progress = clampProgress(rawProgress);
  const stageIndex = item.stages.reduce((index, stage, i) => progress >= stage.at ? i : index, 0);
  const afterCrack = Math.max(0, (progress - item.crackAt) / (1 - item.crackAt));
  const tensionYielded = item.tensionYieldAt !== null && progress >= item.tensionYieldAt;
  const compressionYielded = item.compressionYieldAt !== null && progress >= item.compressionYieldAt;
  const concreteCrushed = progress === 1 && id !== "single-low";
  const stiffnessLoss = id === "single-low" ? Math.min(1, afterCrack * 3) : afterCrack;
  const initialNeutralDepth = Math.max(.5, item.neutralDepth + .06);
  return {
    progress, stageIndex, stage: item.stages[stageIndex],
    tensionYielded, compressionYielded, concreteCrushed,
    failed: progress === 1,
    // 点击“混凝土开裂”阶段即显示初始裂缝；长度仅为教学示意。
    crackExtent: progress < item.crackAt ? 0 : Math.min(1, .08 + afterCrack * (id === "single-low" ? 5 : 1.8)),
    crackWidth: 1 + afterCrack * (id === "single-low" ? 5 : 2),
    sag: item.maxSag * (progress * .24 + stiffnessLoss * .76),
    neutralDepth: initialNeutralDepth + (item.neutralDepth - initialNeutralDepth) * Math.min(1, progress / .55),
    damage: id === "single-low" ? 0 : Math.max(0, (progress - .92) / .08),
    tensionStatus: progress === 0 ? "未加载" : tensionYielded ? "已屈服" : "未屈服",
    compressionStatus: item.kind === "single" ? "不计受压纵筋" : progress === 0 ? "未加载" : compressionYielded ? "已屈服" : "未屈服",
    concreteStatus: concreteCrushed ? "已压碎" : progress === 0 ? "未加载" : progress > .92 && id !== "single-low" ? "接近极限" : "受压",
  };
}
export function beamY(x: number, depth: number, sag: number) {
  const t = (x - 62) / 476;
  return 112 + 70 * depth + 4 * sag * t * (1 - t);
}
export function beamOutline(sag: number) {
  return "M62 112 Q300 " + (112 + sag * 2) + " 538 112 L538 182 Q300 " + (182 + sag * 2) + " 62 182 Z";
}
export function steelPath(depth: number, sag: number) {
  const y = 112 + 70 * depth;
  const end = beamY(78, depth, sag);
  return "M78 " + end + " Q300 " + (2 * (y + sag) - end) + " 522 " + end;
}
export function compressionOutline(sag: number, depth: number) {
  const y = 112 + 70 * depth;
  return "M62 112 Q300 " + (112 + sag * 2) + " 538 112 L538 " + y + " Q300 " + (y + sag * 2) + " 62 " + y + " Z";
}
export function crackPoints(x: number, extent: number, neutralDepth: number, sag: number) {
  const maxHeight = Math.max(.12, 1 - neutralDepth - .08);
  return Array.from({ length: 6 }, (_, index) => {
    const depth = 1 - maxHeight * extent * index / 5;
    return (x + (index % 2 ? 3 : -3)) + "," + beamY(x, depth, sag);
  }).join(" ");
}
