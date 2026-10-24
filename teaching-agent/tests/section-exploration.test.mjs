import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import vm from "node:vm";
import { EXAMPLE, auditFeedback, evaluateSectionExample } from "../src/features/beam-demo/exploration-model.ts";
import { decodeExploration, EMPTY_EXPLORATION, EXPLORATION_STORAGE_KEY } from "../src/features/beam-demo/exploration-store.ts";
import { BEAM_STORAGE_KEY, decodeBeamCheckpoint } from "../src/features/beam-demo/store.ts";
import { LINKED_STORAGE_KEY } from "../src/features/linked-practice/store.ts";
import { SELF_TEST_STORAGE_KEY } from "../src/lib/self-test/store.ts";
import { PHASE_ORDER, TEACHING_PHASES } from "../src/features/beam-demo/teaching-phases.ts";

test("移植公式与附件原函数一致，原件哈希可追溯", () => {
  const bytes = fs.readFileSync(new URL("../docs/section-exploration/source/构知教学创新网页.html", import.meta.url));
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), "1c058ed953f6db31e032d3b7a8849092b99c01661d9bf0db08104a24252c7be0");
  const raw = bytes.toString("utf8").match(/function computeBeam\(as\)\{[\s\S]*?\}\s*(?=function updateBeam)/)?.[0];
  assert.ok(raw, "原始示例函数可定位");
  // Only the reviewed pure numeric function is evaluated, never the DOM/network script.
  const original = vm.runInNewContext("(" + raw + ")", {}, { timeout: 100 });
  for (const area of [100, 150, 240, 250, 950, 2360, 2370, 2800, 3000]) {
    const before = original(area), after = evaluateSectionExample(area);
    assert.equal(after.x, before.x); assert.equal(after.xi, before.xi);
    assert.equal(after.label, before.state); assert.equal(after.moment, before.m);
  }
});

test("配筋下限与相对受压区边界同时满足才输出适筋承载力", () => {
  assert.equal(evaluateSectionExample(240).moment, null);
  assert.notEqual(evaluateSectionExample(250).moment, null);
  const limit = EXAMPLE.limitXi * EXAMPLE.effectiveHeight * EXAMPLE.alpha1 * EXAMPLE.concreteStrength * EXAMPLE.width / EXAMPLE.steelStrength;
  assert.notEqual(evaluateSectionExample(limit - .000001).moment, null);
  assert.equal(evaluateSectionExample(limit + .000001).moment, null);
  assert.equal(evaluateSectionExample(2800).moment, null);
  assert.equal(evaluateSectionExample(950).moment.toFixed(1), "141.0");
});

test("正常示例受压区增高、内力臂缩短，承载力不与钢筋面积简单成比例", () => {
  let previous = evaluateSectionExample(250);
  for (let area = 260; area <= 2360; area += 10) {
    const next = evaluateSectionExample(area);
    assert.ok(next.x > previous.x && next.moment > previous.moment);
    previous = next;
  }
  assert.ok(evaluateSectionExample(1000).moment / evaluateSectionExample(500).moment < 2);
});

test("输入与绘图范围受控，少筋和超筋不产生虚假的承载力数值", () => {
  for (const value of [0, 99, 3001, NaN, Infinity]) assert.throws(() => evaluateSectionExample(value));
  for (let area = 100; area <= 3000; area += 10) {
    const frame = evaluateSectionExample(area);
    assert.ok(Number.isFinite(frame.x) && frame.compressionHeight > 0 && frame.compressionHeight < 210);
    assert.ok(frame.barRadius >= 3 && frame.barRadius <= 13);
    if (frame.kind !== "normal") assert.equal(frame.moment, null);
  }
});

test("预置审查指出结论边界，三个教学阶段保留完整活动证据", () => {
  assert.equal(auditFeedback(null), null);
  assert.match(auditFeedback("yes"), /一项承载力核验不能证明/);
  assert.match(auditFeedback("no"), /判断正确/);
  assert.match(auditFeedback("no"), /受剪、裂缝、挠度、锚固及构造/);
  assert.deepEqual(PHASE_ORDER.map(key => TEACHING_PHASES[key].items.length), [3, 6, 3]);
  for (const phase of Object.values(TEACHING_PHASES)) for (const row of phase.items) assert.ok(row.length === 4 && row.every(Boolean));
  assert.match(TEACHING_PHASES.during.items.at(-1)[0], /78—90/);
});

test("新检查点严格解码并与原动画、自测、关联练习隔离", () => {
  const example = { ...EMPTY_EXPLORATION, panel: "exploration", steelArea: 960, phase: "during", auditAnswer: "no" };
  assert.deepEqual(decodeExploration(JSON.parse(JSON.stringify(example))), example);
  for (const patch of [{ version: 2 }, { panel: "unknown" }, { steelArea: 950.5 }, { steelArea: 90 }, { steelArea: 3010 }, { steelArea: NaN }, { phase: "missing" }, { auditAnswer: undefined }])
    assert.throws(() => decodeExploration({ ...EMPTY_EXPLORATION, ...patch }));
  assert.equal(new Set([EXPLORATION_STORAGE_KEY, BEAM_STORAGE_KEY, LINKED_STORAGE_KEY, SELF_TEST_STORAGE_KEY]).size, 4);
  assert.deepEqual(decodeBeamCheckpoint({ version: 1, caseId: "double-elastic", progress: .68, view: "section" }),
    { version: 1, caseId: "double-elastic", progress: .68, view: "section" });
});
