"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createPersistentStore, localStorageAdapter } from "@/lib/self-test/persistence";
import { wrongbookStore } from "@/lib/wrongbook/store";
import { KNOWLEDGE_SECTIONS } from "@/lib/sections";
import { getQuestionCatalog, isUsableQuestion } from "@/lib/question-catalog";
import mainTags from "@/content/question-k.json";
import linkedTags from "@/features/linked-practice/content/question-k.json";
import slidesData from "@/content/slides.json";
import { EMPTY_PROGRESS, computeMastery, decodeProgress, recordAttempt, recordView, type Mastery, type ProgressState } from "./model";

export const PROGRESS_STORAGE_KEY = "ch6-progress-v1";
export const progressStore = createPersistentStore(
  localStorageAdapter<ProgressState>(PROGRESS_STORAGE_KEY, EMPTY_PROGRESS, decodeProgress),
  EMPTY_PROGRESS,
  "学习进度",
);

const TAGS: Record<string, { k: string }> = { ...(mainTags as Record<string, { k: string }>), ...(linkedTags as Record<string, { k: string }>) };

/** 题目属于哪个知识点；没有标注时返回 null（不计入掌握度） */
export function kOfQuestion(id: string): string | null {
  return TAGS[id]?.k ?? null;
}

/** 每个知识点的课件页数（K12–K14 为 0） */
export const SLIDE_PAGES: Record<string, number> = (() => {
  const count: Record<string, number> = {};
  for (const s of slidesData as { section: string }[]) {
    const k = /^K\d+/.exec(s.section)?.[0];
    if (k) count[k] = (count[k] ?? 0) + 1;
  }
  return count;
})();

export function trackSlideView(k: string, page: number) {
  if (!/^K([1-9]|1[0-4])$/.test(k)) return;
  void progressStore.update(state => recordView(state, k, page));
}

export function trackAttempt(questionId: string, ok: boolean, fallbackK?: string | null) {
  const k = kOfQuestion(questionId) ?? fallbackK ?? null;
  if (!k) return;
  void progressStore.update(state => recordAttempt(state, questionId, k, ok));
}

export function trackAttemptAt(questionId: string, ok: boolean, at: number) {
  const k = kOfQuestion(questionId);
  if (!k) return;
  void progressStore.update(state => recordAttempt(state, questionId, k, ok, at));
}

export function trackAttempts(results: { questionId: string; ok: boolean }[]) {
  void progressStore.update(state => results.reduce((s, r) => {
    const k = kOfQuestion(r.questionId);
    return k ? recordAttempt(s, r.questionId, k, r.ok) : s;
  }, state));
}

export function useProgress() {
  useEffect(() => { void progressStore.initialize(); void wrongbookStore.initialize(); }, []);
  return useSyncExternalStore(progressStore.subscribe, progressStore.getSnapshot, progressStore.getSnapshot);
}

/** 全部知识点的掌握度 + 汇总 */
export function useMastery() {
  const progress = useProgress();
  const book = useSyncExternalStore(wrongbookStore.subscribe, wrongbookStore.getSnapshot, wrongbookStore.getSnapshot);
  return useMemo(() => {
    const wrongIds = book.value.records.map(r => r.questionId);
    const list: Mastery[] = KNOWLEDGE_SECTIONS.map(s => computeMastery(progress.value, s.id, SLIDE_PAGES[s.id] ?? 0, wrongIds));
    const byK = Object.fromEntries(list.map(m => [m.k, m])) as Record<string, Mastery>;
    const pagesViewed = Object.values(progress.value.viewed).reduce((n, p) => n + (p?.length ?? 0), 0);
    const mastered = list.filter(m => (m.score ?? 0) >= 0.8).length;
    const started = progress.value.updatedAt > 0;
    return { ready: progress.ready, list, byK, pagesViewed, mastered, wrongOpen: wrongIds.length, started };
  }, [progress, book]);
}

/** 某个知识点挑 n 道题：优先没做过的，其次最久没做的（只从自测题库里挑） */
export function pickQuestionsForK(k: string, n = 3): string[] {
  const attempts = progressStore.getSnapshot().value.attempts;
  const usable = new Set(getQuestionCatalog().filter(isUsableQuestion).map(q => q.id));
  return Object.entries(mainTags as Record<string, { k: string }>)
    .filter(([id, v]) => v.k === k && usable.has(id))
    .map(([id]) => ({ id, last: attempts[id]?.log.at(-1)?.at ?? 0, r: Math.random() }))
    .sort((a, b) => a.last - b.last || a.r - b.r)
    .slice(0, n)
    .map(x => x.id);
}

/** 专项练习里属于该知识点的题数 */
export function linkedCountForK(k: string): number {
  return Object.values(linkedTags as Record<string, { k: string }>).filter(v => v.k === k).length;
}

/**
 * 智能组卷：薄弱知识点优先，其次没做过的题、上次做错的题；每个知识点最多 4 道，保证覆盖面。
 * 返回题目 ID 和本组主要覆盖的知识点。
 */
export function pickSmartSet(n = 10): { ids: string[]; ks: string[] } {
  const state = progressStore.getSnapshot().value;
  const wrong = new Set(wrongbookStore.getSnapshot().value.records.map(r => r.questionId));
  const usable = getQuestionCatalog().filter(isUsableQuestion);
  const tags = mainTags as Record<string, { k: string }>;
  const weakness = (k: string) => {
    const m = computeMastery(state, k, SLIDE_PAGES[k] ?? 0, [...wrong]);
    return m.score === null ? (m.answered ? 0.65 : 0.55) : 1 - m.score;
  };
  const now = Date.now();
  const ranked = usable
    .map(q => {
      const k = tags[q.id]?.k;
      const last = state.attempts[q.id]?.log.at(-1);
      let p = k ? weakness(k) : 0.3;
      if (!last) p += 0.3;
      else if (!last.ok) p += 0.5;
      else p -= Math.max(0, 0.6 - (now - last.at) / (7 * 86_400_000));
      if (wrong.has(q.id)) p += 0.3;
      return { id: q.id, k: k ?? "", p: p + Math.random() * 0.25 };
    })
    .sort((a, b) => b.p - a.p);
  const perK: Record<string, number> = {};
  const ids: string[] = [];
  for (const x of ranked) {
    if (ids.length >= n) break;
    if ((perK[x.k] ?? 0) >= 4) continue;
    perK[x.k] = (perK[x.k] ?? 0) + 1;
    ids.push(x.id);
  }
  const ks = Object.entries(perK).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter(Boolean);
  return { ids, ks };
}
