import test from "node:test";
import assert from "node:assert/strict";
import { BEAM_CASES, beamOutline, beamY, casesForKind, clampProgress, compressionOutline, crackPoints, getBeamCase, getBeamFrame, steelPath } from "../src/features/beam-demo/model.ts";
import { BEAM_STORAGE_KEY, EMPTY_BEAM_CHECKPOINT, decodeBeamCheckpoint } from "../src/features/beam-demo/store.ts";
import { LINKED_STORAGE_KEY } from "../src/features/linked-practice/store.ts";
import { SELF_TEST_STORAGE_KEY } from "../src/lib/self-test/store.ts";

test("独立单筋和双筋情形均可达，阶段边界有序且覆盖起终点", () => {
  assert.equal(casesForKind("single").length, 3);
  assert.equal(casesForKind("double").length, 2);
  assert.equal(new Set(BEAM_CASES.map(item => item.id)).size, 5);
  for (const item of BEAM_CASES) {
    assert.equal(item.stages[0].at, 0);
    assert.equal(item.stages.at(-1).at, 1);
    assert.ok(item.stages.every((stage, index) => !index || stage.at > item.stages[index - 1].at));
    assert.equal(getBeamFrame(item.id, 0).stageIndex, 0);
    assert.equal(getBeamFrame(item.id, 1).stageIndex, 3);
    assert.equal(getBeamFrame(item.id, item.crackAt - .001).crackExtent, 0);
    assert.ok(getBeamFrame(item.id, item.crackAt).crackExtent > 0, "开裂阶段须显示可见的初始裂缝");
  }
});

test("适筋先钢筋屈服再压碎，超筋末态钢筋仍未屈服", () => {
  const normal = getBeamFrame("single-normal", .7);
  assert.equal(normal.tensionYielded, true);
  assert.equal(normal.concreteCrushed, false);
  assert.equal(getBeamFrame("single-normal", 1).concreteCrushed, true);
  for (let i = 0; i <= 100; i++) assert.equal(getBeamFrame("single-high", i / 100).tensionYielded, false);
  assert.equal(getBeamFrame("single-high", 1).concreteCrushed, true);
});

test("少筋开裂与快速屈服相接，不把拉区失效画成混凝土先压碎", () => {
  const item = getBeamCase("single-low");
  assert.ok(item.tensionYieldAt - item.crackAt < .03);
  assert.equal(getBeamFrame(item.id, item.crackAt - .01).crackExtent, 0);
  assert.equal(getBeamFrame(item.id, .5).tensionYielded, true);
  assert.equal(getBeamFrame(item.id, 1).concreteCrushed, false);
});

test("双筋区分受压筋屈服与未屈服，单筋不出现受压筋屈服", () => {
  assert.equal(getBeamFrame("double-yield", 1).compressionYielded, true);
  assert.equal(getBeamFrame("double-elastic", 1).compressionYielded, false);
  assert.equal(getBeamFrame("double-elastic", 1).tensionYielded, true);
  for (const item of casesForKind("single")) assert.equal(getBeamFrame(item.id, 1).compressionYielded, false);
});

test("连续帧几何有限，支座不漂移，未加载钢筋线保持直线", () => {
  for (const item of BEAM_CASES) for (let i = 0; i <= 100; i++) {
    const frame = getBeamFrame(item.id, i / 100);
    assert.ok(frame.neutralDepth > .1 && frame.neutralDepth < .8);
    assert.ok(frame.crackExtent >= 0 && frame.crackExtent <= 1);
    assert.equal(beamY(62, 0, frame.sag), 112);
    assert.equal(beamY(538, 1, frame.sag), 182);
    assert.equal(beamY(300, .5, frame.sag), 147 + frame.sag);
    for (const geometry of [beamOutline(frame.sag), compressionOutline(frame.sag, frame.neutralDepth), steelPath(.85, frame.sag), crackPoints(300, frame.crackExtent, frame.neutralDepth, frame.sag)])
      assert.ok(!/NaN|Infinity/.test(geometry));
  }
  assert.equal(steelPath(.85, 0), "M78 171.5 Q300 171.5 522 171.5");
});

test("进度边界与存储格式严格校验，演示记录使用独立key", () => {
  assert.equal(clampProgress(-3), 0);
  assert.equal(clampProgress(5), 1);
  assert.throws(() => clampProgress(NaN));
  assert.deepEqual(decodeBeamCheckpoint(JSON.parse(JSON.stringify({ ...EMPTY_BEAM_CHECKPOINT, caseId: "double-elastic", progress: .7, view: "section" }))),
    { version: 1, caseId: "double-elastic", progress: .7, view: "section" });
  for (const patch of [{ caseId: "unknown" }, { progress: NaN }, { progress: -1 }, { progress: 1.01 }, { view: "unknown" }])
    assert.throws(() => decodeBeamCheckpoint({ ...EMPTY_BEAM_CHECKPOINT, ...patch }));
  assert.notEqual(BEAM_STORAGE_KEY, LINKED_STORAGE_KEY);
  assert.notEqual(BEAM_STORAGE_KEY, SELF_TEST_STORAGE_KEY);
});
