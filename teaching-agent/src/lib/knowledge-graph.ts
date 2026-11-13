/** 第六章知识点的前置关系：学 K 之前最好先懂的那几个。用于知识地图的连线和学习建议。 */
export const PREREQ: Record<string, string[]> = {
  K2: ["K1"],
  K3: ["K2"],
  K4: ["K3"],
  K5: ["K4"],
  K6: ["K5"],
  K7: ["K5"],
  K8: ["K3"],
  K9: ["K8"],
  K10: ["K9"],
  K11: ["K10", "K5"],
  K12: ["K11", "K5"],
  K13: ["K4"],
  K14: ["K13"],
};

export const prereqOf = (k: string) => PREREQ[k] ?? [];
