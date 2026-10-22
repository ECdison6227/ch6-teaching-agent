import { createPersistentStore, localStorageAdapter } from "@/lib/self-test/persistence";
import { EMPTY_STATE, type Attempt, type LinkedQuestion, type LinkedState, type Profile } from "./model";

export const LINKED_STORAGE_KEY = "ch6-linked-practice-v1";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const nullableString = (value: unknown) => value === null || typeof value === "string";
function validProfile(value: unknown): value is Profile {
  return object(value) && ["single", "double"].includes(value.topic as string)
    && ["objective", "judge", "choice", "fill", "calculation"].includes(value.filter as string);
}
function validQuestion(value: unknown): value is LinkedQuestion {
  return object(value) && typeof value.id === "string" && !!value.id && typeof value.contentHash === "string"
    && ["single", "double", "cross-module"].includes(value.topic as string)
    && ["judge", "choice", "fill", "calculation"].includes(value.type as string)
    && typeof value.prompt === "string" && typeof value.answerRaw === "string" && nullableString(value.answerValue)
    && typeof value.analysis === "string" && typeof value.category === "string" && typeof value.knowledge === "string"
    && typeof value.sourceLabel === "string" && nullableString(value.sourceAlias) && typeof value.isAnchor === "boolean"
    && Array.isArray(value.options) && value.options.every(option => object(option) && typeof option.id === "string" && typeof option.text === "string");
}
function validAttempt(value: unknown): value is Attempt {
  return object(value) && typeof value.id === "string" && !!value.id && validQuestion(value.question)
    && typeof value.answer === "string" && ["correct", "wrong"].includes(value.outcome as string)
    && ["reference-check", "self-report"].includes(value.method as string) && typeof value.at === "number" && Number.isFinite(value.at);
}
export function decodeLinkedState(value: unknown): LinkedState {
  if (!object(value) || value.version !== 1 || !["start", "practice", "history"].includes(value.screen as string) || !validProfile(value.profile)
    || !nullableString(value.currentId) || !nullableString(value.currentHash) || !nullableString(value.resultId) || !nullableString(value.returnToId)
    || !nullableString(value.context) || typeof value.draft !== "string" || typeof value.revealed !== "boolean"
    || !Array.isArray(value.attempts) || !value.attempts.every(validAttempt)
    || new Set(value.attempts.map(attempt => attempt.id)).size !== value.attempts.length
    || !Array.isArray(value.seenIds) || !value.seenIds.every(id => typeof id === "string")
    || (value.resultId !== null && !value.attempts.some(attempt => attempt.id === value.resultId && attempt.question.id === value.currentId)))
    throw new Error("关联练习记录格式无效");
  return value as unknown as LinkedState;
}
export const linkedStore = createPersistentStore(localStorageAdapter(LINKED_STORAGE_KEY, EMPTY_STATE, decodeLinkedState), EMPTY_STATE, "关联练习");
