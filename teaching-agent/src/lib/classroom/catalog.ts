import "server-only";
import { questions, type Question } from "../questions";
import { normLetter } from "../grading";
import { ClassroomError, publicQuestion } from "./store";

// Replaced with issue #1's shared catalog when that contract lands. No client bank import.
export function publishable(q: Question) {
  if (q.verified !== true || !q.answer?.trim() || !q.prompt?.trim()) return false;
  if (q.type === "judge") return ["T", "F"].includes(normLetter(q.answer));
  if (q.type === "choice") return q.options?.length >= 2 && new Set(q.options.map(o => o.id)).size === q.options.length &&
    q.options.every(o => o.id && o.text) && q.options.some(o => o.id === normLetter(q.answer!));
  return q.type === "fill";
}
export function classroomQuestion(id: string): Question {
  const q = questions.find(q => q.id === id);
  if (!q || !publishable(q)) throw new ClassroomError("该题尚未复核、缺少答案或结构无效，不能发布");
  return q;
}
export function classroomCatalog() { return questions.filter(publishable).map(publicQuestion); }
