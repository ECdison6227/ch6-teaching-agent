import { createPersistentStore, localStorageAdapter } from "@/lib/self-test/persistence";
import { EXAMPLE, type AuditAnswer } from "./exploration-model";
import { PHASE_ORDER, type TeachingPhase } from "./teaching-phases";
export type ExplorationState = {
  version: 1; panel: "animation" | "exploration"; steelArea: number;
  auditAnswer: AuditAnswer; phase: TeachingPhase;
};
export const EXPLORATION_STORAGE_KEY = "ch6-section-exploration-v1";
export const EMPTY_EXPLORATION: ExplorationState = { version: 1, panel: "animation", steelArea: 950, auditAnswer: null, phase: "before" };
export function decodeExploration(value: unknown): ExplorationState {
  if (!value || typeof value !== "object") throw new Error("参数探究记录无效");
  const state = value as ExplorationState;
  if (state.version !== 1 || !["animation", "exploration"].includes(state.panel)
    || !Number.isInteger(state.steelArea) || state.steelArea < EXAMPLE.minArea || state.steelArea > EXAMPLE.maxArea
    || state.steelArea % EXAMPLE.step !== 0 || ![null, "yes", "no"].includes(state.auditAnswer)
    || !PHASE_ORDER.includes(state.phase)) throw new Error("参数探究记录无效");
  return state;
}
export const explorationStore = createPersistentStore(
  localStorageAdapter(EXPLORATION_STORAGE_KEY, EMPTY_EXPLORATION, decodeExploration), EMPTY_EXPLORATION, "参数探究",
);
