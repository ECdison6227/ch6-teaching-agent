/**
 * 学习进度与掌握度（无账号，本机优先）。
 *
 * 掌握度 = 课件覆盖 × 0.2 + 近期正确率 × 0.6 + 错题清零 × 0.2
 * - 正确率按时间衰减（半衰期 14 天），越近的作答越重要
 * - 同一知识点作答不足 3 题时不给分数，只标「待练」，避免一题定生死
 * - K12–K14 没有课件：权重改为 正确率 0.75 + 错题清零 0.25
 */
import { KNOWLEDGE_SECTIONS } from "@/lib/sections";

export type Kid = (typeof KNOWLEDGE_SECTIONS)[number]["id"];
export type Attempt = { ok: boolean; at: number };
export type ProgressState = {
  version: 1;
  /** 每个知识点看过的课件页码 */
  viewed: Partial<Record<string, number[]>>;
  /** 每道题最近 5 次作答 */
  attempts: Record<string, { k: string; log: Attempt[] }>;
  updatedAt: number;
};

export const EMPTY_PROGRESS: ProgressState = { version: 1, viewed: {}, attempts: {}, updatedAt: 0 };

const HALF_LIFE = 14 * 86_400_000;
export const MIN_ATTEMPTS = 3;

export function recordView(state: ProgressState, k: string, page: number, at = Date.now()): ProgressState {
  const pages = state.viewed[k] ?? [];
  if (pages.includes(page)) return state;
  return { ...state, viewed: { ...state.viewed, [k]: [...pages, page] }, updatedAt: at };
}

export function recordAttempt(state: ProgressState, questionId: string, k: string, ok: boolean, at = Date.now()): ProgressState {
  const prev = state.attempts[questionId]?.log ?? [];
  if (prev.some(x => x.at === at)) return state;
  const log = [...prev, { ok, at }].slice(-5);
  return { ...state, attempts: { ...state.attempts, [questionId]: { k, log } }, updatedAt: at };
}

export type Mastery = {
  k: string;
  /** 0–1；作答不足时为 null（待练） */
  score: number | null;
  coverage: number | null;
  accuracy: number | null;
  answered: number;
  wrongOpen: number;
  /** 建议的下一步 */
  next: "slides" | "practice" | "wrongbook" | "done";
};

export function computeMastery(
  state: ProgressState,
  k: string,
  slidePages: number,
  wrongOpenIds: readonly string[],
  now = Date.now(),
): Mastery {
  const viewed = state.viewed[k]?.length ?? 0;
  const coverage = slidePages > 0 ? Math.min(1, viewed / slidePages) : null;
  let w = 0, sum = 0, answered = 0;
  const mine = new Set<string>();
  for (const [id, rec] of Object.entries(state.attempts)) {
    if (rec.k !== k || !rec.log.length) continue;
    answered++; mine.add(id);
    for (const a of rec.log) {
      const weight = Math.pow(0.5, Math.max(0, now - a.at) / HALF_LIFE);
      w += weight; sum += a.ok ? weight : 0;
    }
  }
  const accuracy = w > 0 ? sum / w : null;
  const wrongOpen = wrongOpenIds.filter(id => mine.has(id)).length;
  const cleared = answered ? 1 - Math.min(1, wrongOpen / answered) : 0;
  let score: number | null = null;
  if (answered >= MIN_ATTEMPTS && accuracy !== null) {
    score = coverage === null ? accuracy * 0.75 + cleared * 0.25 : coverage * 0.2 + accuracy * 0.6 + cleared * 0.2;
  }
  const next: Mastery["next"] = wrongOpen > 0 ? "wrongbook"
    : coverage !== null && coverage < 0.6 ? "slides"
    : score === null || score < 0.8 ? "practice" : "done";
  return { k, score, coverage, accuracy, answered, wrongOpen, next };
}

export function decodeProgress(raw: unknown): ProgressState {
  if (!raw || typeof raw !== "object") return EMPTY_PROGRESS;
  const s = raw as ProgressState;
  if (s.version !== 1 || typeof s.viewed !== "object" || typeof s.attempts !== "object") return EMPTY_PROGRESS;
  return { version: 1, viewed: s.viewed ?? {}, attempts: s.attempts ?? {}, updatedAt: Number(s.updatedAt) || 0 };
}

/** 合并两份进度（学习码同步时用）：页码取并集，作答记录按时间合并去重。 */
export function mergeProgress(a: ProgressState, b: ProgressState): ProgressState {
  const viewed: ProgressState["viewed"] = { ...a.viewed };
  for (const [k, pages] of Object.entries(b.viewed)) viewed[k] = [...new Set([...(viewed[k] ?? []), ...(pages ?? [])])];
  const attempts: ProgressState["attempts"] = { ...a.attempts };
  for (const [id, rec] of Object.entries(b.attempts)) {
    const seen = new Set((attempts[id]?.log ?? []).map(x => `${x.at}:${x.ok}`));
    const log = [...(attempts[id]?.log ?? []), ...rec.log.filter(x => !seen.has(`${x.at}:${x.ok}`))].sort((x, y) => x.at - y.at).slice(-5);
    attempts[id] = { k: rec.k, log };
  }
  return { version: 1, viewed, attempts, updatedAt: Math.max(a.updatedAt, b.updatedAt) };
}
