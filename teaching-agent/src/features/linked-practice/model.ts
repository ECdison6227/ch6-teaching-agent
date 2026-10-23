import rawQuestions from "./content/questions.json";
import rawRelations from "./content/relations.json";
import manifest from "./content/manifest.json";

export type Topic = "single" | "double" | "cross-module";
export type QuestionType = "judge" | "choice" | "fill" | "calculation";
export type Filter = "objective" | QuestionType;
export type LinkedQuestion = {
  id: string; contentHash: string; topic: Topic; type: QuestionType;
  prompt: string; options: { id: string; text: string }[]; answerRaw: string; answerValue: string | null;
  analysis: string; category: string; knowledge: string; sourceLabel: string; sourceAlias: string | null; isAnchor: boolean;
};
export type LinkedRelation = { id: string; fromId: string; toId: string; type: string; label: string; reason: string };
export type Profile = { topic: "single" | "double"; filter: Filter };
export type Attempt = {
  id: string; question: LinkedQuestion; answer: string; outcome: "correct" | "wrong";
  method: "reference-check" | "self-report"; at: number;
};
export type LinkedState = {
  version: 1; screen: "start" | "practice" | "history"; profile: Profile;
  currentId: string | null; currentHash: string | null; draft: string; revealed: boolean;
  resultId: string | null; returnToId: string | null; context: string | null;
  attempts: Attempt[]; seenIds: string[];
};
export type Recommendation = { question: LinkedQuestion; label: string; reason: string; relation: string };
export const TOPIC_LABELS: Record<Topic, string> = { single: "单筋梁", double: "双筋梁", "cross-module": "关联拓展" };
export const TYPE_LABELS: Record<QuestionType, string> = { judge: "判断题", choice: "选择题", fill: "填空题", calculation: "计算题" };
export const FILTER_LABELS: Record<Filter, string> = { objective: "判断与选择", judge: "判断题", choice: "选择题", fill: "填空题", calculation: "计算题" };
export const DEFAULT_PROFILE: Profile = { topic: "single", filter: "objective" };
export const EMPTY_STATE: LinkedState = {
  version: 1, screen: "start", profile: DEFAULT_PROFILE, currentId: null, currentHash: null,
  draft: "", revealed: false, resultId: null, returnToId: null, context: null, attempts: [], seenIds: [],
};
export const CATALOG_INFO = manifest;
const catalog = rawQuestions as LinkedQuestion[];
const byId = new Map(catalog.map(question => [question.id, question]));
const relations = rawRelations as LinkedRelation[];
if (byId.size !== catalog.length || catalog.some(question => !question.prompt || !question.answerRaw)
  || relations.some(relation => !byId.has(relation.fromId) || !byId.has(relation.toId))) throw new Error("关联练习资料不完整");
export const getLinkedCatalog = (): readonly LinkedQuestion[] => catalog;
export const getLinkedRelations = (): readonly LinkedRelation[] => relations;
export const getLinkedQuestion = (id: string | null) => id ? byId.get(id) : undefined;
export const currentQuestion = (state: LinkedState) => {
  const question = getLinkedQuestion(state.currentId);
  return question?.contentHash === state.currentHash ? question : undefined;
};
export const currentResult = (state: LinkedState) => state.attempts.find(attempt => attempt.id === state.resultId);
export const isAutomatic = (question: LinkedQuestion) => question.type === "judge" || question.type === "choice";
export function filterLinkedQuestions(profile: Profile): LinkedQuestion[] {
  return catalog.filter(question => question.topic === profile.topic &&
    (profile.filter === "objective" ? isAutomatic(question) : question.type === profile.filter));
}
export function openQuestion(state: LinkedState, questionId: string, options: { returnToId?: string | null; context?: string | null } = {}): LinkedState {
  const question = getLinkedQuestion(questionId);
  if (!question) throw new Error("这道题已更新，请重新选择。");
  return { ...state, screen: "practice", currentId: question.id, currentHash: question.contentHash, draft: "", revealed: false,
    resultId: null, returnToId: options.returnToId ?? null, context: options.context ?? null,
    seenIds: [...new Set([...state.seenIds, question.id])] };
}
export function startLinkedPractice(state: LinkedState, profile: Profile): LinkedState {
  const pool = filterLinkedQuestions(profile);
  if (!pool.length) throw new Error("这个主题暂时没有对应题型，请换一种。");
  const selected = pool.find(question => question.isAnchor) ?? pool[0];
  return openQuestion({ ...state, profile, seenIds: [] }, selected.id);
}
export function submitLinkedAnswer(state: LinkedState, selfOutcome?: "correct" | "wrong", at = Date.now(), id?: string): LinkedState {
  const question = currentQuestion(state);
  if (!question) throw new Error("当前题目已更新，请重新开始。");
  if (state.resultId) return state;
  const automatic = isAutomatic(question);
  if (automatic && !question.options.some(option => option.id === state.draft) && !(question.type === "judge" && ["T", "F"].includes(state.draft)))
    throw new Error("先选一个答案。");
  if (!automatic && (!state.revealed || !selfOutcome)) throw new Error("先对照参考解答，再记录掌握情况。");
  const attempt: Attempt = {
    id: id ?? "linked-" + at.toString(36) + "-" + Math.random().toString(36).slice(2, 10),
    question: { ...question, options: question.options.map(option => ({ ...option })) }, answer: state.draft,
    outcome: automatic ? state.draft === question.answerValue ? "correct" : "wrong" : selfOutcome!,
    method: automatic ? "reference-check" : "self-report", at,
  };
  return { ...state, revealed: true, resultId: attempt.id, attempts: [...state.attempts, attempt] };
}
export function chooseNextQuestion(state: LinkedState): LinkedState {
  const pool = filterLinkedQuestions(state.profile);
  const next = pool.find(question => !state.seenIds.includes(question.id));
  return next ? openQuestion(state, next.id) : { ...state, screen: "start" };
}
const RECOMMEND_LABELS: Record<string, string> = {
  prerequisite: "补一下基础", parallel: "同考点练习", contrast: "辨清概念", inverse: "反向练习", advanced: "进阶练习", "cross-module": "拓展一下",
};
export function recommendLinkedQuestions(state: LinkedState): Recommendation[] {
  const question = currentQuestion(state);
  const result = currentResult(state);
  if (!question || !result) return [];
  const output: Recommendation[] = [];
  const add = (target: LinkedQuestion | undefined, label: string, reason: string, relation: string) => {
    if (target && target.id !== question.id && !output.some(item => item.question.id === target.id || item.relation === relation))
      output.push({ question: target, label, reason, relation });
  };
  if (state.returnToId) add(getLinkedQuestion(state.returnToId), "回到原题", "基础练过了，再试一次原来的题。", "return");
  const order = result.outcome === "wrong"
    ? ["prerequisite", "contrast", "parallel", "inverse", "advanced", "cross-module"]
    : ["inverse", "advanced", "parallel", "contrast", "cross-module", "prerequisite"];
  const edges = relations.filter(relation => relation.fromId === question.id)
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)
      || Number(state.seenIds.includes(a.toId)) - Number(state.seenIds.includes(b.toId)));
  for (const edge of edges) add(getLinkedQuestion(edge.toId), RECOMMEND_LABELS[edge.type] ?? "关联练习", edge.reason, edge.type);
  if (output.length < 2) {
    const pool = filterLinkedQuestions(state.profile).filter(candidate => !state.seenIds.includes(candidate.id));
    const candidate = pool.find(candidate => candidate.category === question.category) ?? pool[0];
    add(candidate, "同主题练习", "换一道同主题的题，再练一遍。", "same-topic");
  }
  return output.slice(0, 3);
}
export function followRecommendation(state: LinkedState, recommendation: Recommendation): LinkedState {
  const returnToId = recommendation.relation === "return" ? null
    : recommendation.relation === "prerequisite" ? state.returnToId ?? state.currentId : state.returnToId;
  return openQuestion(state, recommendation.question.id, { returnToId, context: recommendation.label + " · " + recommendation.reason });
}
export function summarizeLinkedAttempts(attempts: readonly Attempt[]) {
  const checked = attempts.filter(attempt => attempt.method === "reference-check");
  return { checked: checked.length, correct: checked.filter(attempt => attempt.outcome === "correct").length,
    selfReviewed: attempts.length - checked.length, needsPractice: attempts.filter(attempt => attempt.outcome === "wrong").length };
}
export function exportLinkedMarkdown(state: LinkedState): string {
  return "# 关联练习学习记录\n\n" + state.attempts.map((attempt, index) => [
    "## " + (index + 1) + " " + TOPIC_LABELS[attempt.question.topic] + " · " + TYPE_LABELS[attempt.question.type],
    attempt.question.prompt,
    "作答：" + (attempt.answer || "对照解答后自评"),
    "结果：" + (attempt.outcome === "correct" ? "已掌握" : "待巩固") + (attempt.method === "self-report" ? "（自评）" : "（按资料答案核对）"),
    "参考答案：" + attempt.question.answerRaw,
    attempt.question.analysis,
    "来源：" + attempt.question.sourceLabel + (attempt.question.sourceAlias ? " · " + attempt.question.sourceAlias : ""),
  ].join("\n\n")).join("\n\n---\n\n");
}
