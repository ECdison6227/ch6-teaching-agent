import { createPersistentStore, localStorageAdapter } from "@/lib/self-test/persistence";
import { BEAM_CASES, DEFAULT_BEAM_CASE, type CaseId, type DiagramView } from "./model";
export type BeamCheckpoint = { version: 1; caseId: CaseId; progress: number; view: DiagramView };
export const BEAM_STORAGE_KEY = "ch6-beam-demo-v1";
export const EMPTY_BEAM_CHECKPOINT: BeamCheckpoint = { version: 1, caseId: DEFAULT_BEAM_CASE, progress: 0, view: "beam" };
export function decodeBeamCheckpoint(value: unknown): BeamCheckpoint {
  if (!value || typeof value !== "object") throw new Error("演示记录无效");
  const state = value as BeamCheckpoint;
  if (state.version !== 1 || !BEAM_CASES.some(item => item.id === state.caseId) || !["beam", "section"].includes(state.view)
    || typeof state.progress !== "number" || !Number.isFinite(state.progress) || state.progress < 0 || state.progress > 1) throw new Error("演示记录无效");
  return state;
}
export const beamStore = createPersistentStore(localStorageAdapter(BEAM_STORAGE_KEY, EMPTY_BEAM_CHECKPOINT, decodeBeamCheckpoint), EMPTY_BEAM_CHECKPOINT, "演示进度");
