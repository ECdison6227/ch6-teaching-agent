/** 课件位置：课程主页的「继续学习」和知识地图都靠它和常驻的课件视图通信。 */
const KEY = "ch6:study:last";
export const STUDY_GOTO_EVENT = "ch6:study-goto";

export type StudyPosition = { kid: string; name: string; page?: number; at: number };

export function readStudyPosition(): StudyPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as StudyPosition;
    return value && typeof value.kid === "string" ? value : null;
  } catch {
    return null;
  }
}

export function writeStudyPosition(position: Omit<StudyPosition, "at">) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...position, at: Date.now() }));
  } catch {
    /* 隐私模式下写不进去就算了 */
  }
}

/** 让课件视图跳到某个知识点（K1–K14），可指定页码。课件视图常驻挂载，事件一定有人接。 */
export function requestStudySection(kid: string, page?: number) {
  window.dispatchEvent(new CustomEvent<string>(STUDY_GOTO_EVENT, { detail: page ? `${kid}@${page}` : kid }));
}

/** "K5 单筋矩形截面计算" → "K5"；"封面/导读" → "K0" */
export function kidOfSection(section: string): string {
  const match = /^K\d+/.exec(section);
  return match ? match[0] : "K0";
}
