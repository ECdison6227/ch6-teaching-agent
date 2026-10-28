import test from "node:test";
import assert from "node:assert/strict";
import { beamProxy } from "../src/lib/beam-service.ts";
import { isBeamResult } from "../src/lib/beam-types.ts";

const input = { b_mm: 300, h_mm: 600, h0_mm: 560, as_prime_mm: 40, concrete: "C30", steel: "HRB400", compression_steel: "HRB500", M_design_kNm: 600 };
const prediction = (value, model_key) => ({ value, unit: "mm²", model_key });
const comparison = { model_minus_reference: 1.2, relative_error_percent: 0.1 };
function resultFor(task = "double-a") {
  return {
    task, status: "ok", inputs: { ...input, ...(task === "double-b" ? { Asp_given_mm2: 500 } : {}) },
    materials: { fc_MPa: 14.3, ft_MPa: 1.43, fy_MPa: 360, fyp_MPa: 435, Es_MPa: 200000 },
    geometry: { h0_mm: 560, as_prime_mm: 40, basis: "provided_double_reinforcement_positions" },
    classification: null, prediction: null, comparison: null, model_called: true,
    predictions: { As_required_mm2: prediction(3903.3, task === "double-a" ? "double_a_tension" : "double_b_tension"),
      ...(task === "double-a" ? { Asp_required_mm2: prediction(451.1, "double_a_compression") } : {}) },
    comparisons: { As_required_mm2: comparison, ...(task === "double-a" ? { Asp_required_mm2: comparison } : {}) },
    reference: { As_required_mm2: 3902.1, ...(task === "double-a" ? { Asp_required_mm2: 449.9 } : { Asp_given_mm2: 500 }), branch: "compression_yielded" },
    prediction_review: { status: "ok", Mu_kNm: 600.4, capacity_margin_kNm: 0.4, minimum_area_meets: true, numerical_checks_passed: true, ultimate_strain_full_analysis_performed: false },
    warnings: [], model_versions: { double_a_tension: "fixed-version" }, scope: "双筋连续面积及等效矩形应力图复核",
  };
}
const request = body => new Request("http://local/api/beam/double-a", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("双筋A/B代理分别使用固定内部入口，等级原样传服务端且不伪造分类", async t => {
  for (const task of ["double-a", "double-b"]) {
    const body = { ...input, ...(task === "double-b" ? { Asp_given_mm2: 500 } : {}) };
    const result = resultFor(task);
    t.mock.method(globalThis, "fetch", async (url, options) => {
      assert.equal(String(url), `http://127.0.0.1:8001/v1/${task}`);
      assert.deepEqual(JSON.parse(options.body), body);
      assert.equal(options.redirect, "error");
      return Response.json(result);
    });
    const response = await beamProxy(request(body), task);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), result);
    assert.equal(isBeamResult(result), true);
    t.mock.restoreAll();
  }
});

test("双筋请求拒绝数值材料覆盖、额外目标、缺少已知面积及布尔值", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not call"); });
  for (const [task, body] of [
    ["double-a", { ...input, fc_MPa: 30 }],
    ["double-a", { ...input, Asp_given_mm2: 500 }],
    ["double-a", { ...input, compression_steel: "HRB335" }],
    ["double-a", { ...input, h0_mm: true }],
    ["double-b", input],
    ["double-b", { ...input, Asp_given_mm2: -1 }],
  ]) assert.equal((await beamProxy(request(body), task)).status, 400);
  assert.equal(mock.mock.callCount(), 0);
});

test("双筋规则门控保留公式和原因，A单筋足够及B受压不足都不伪造预测", async t => {
  for (const [task, branch, status] of [["double-a", "single_sufficient", "ok"], ["double-b", "", "needs_more_compression"]]) {
    const stopped = { ...resultFor(task), status, model_called: false, predictions: null, comparisons: null, prediction_review: null,
      reference: { branch, reason: "按原始公式分支停止当前模型调用", As_required_mm2: task === "double-a" ? 516 : null } };
    t.mock.method(globalThis, "fetch", async () => Response.json(stopped));
    const response = await beamProxy(request(stopped.inputs), task);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), stopped);
    assert.equal(isBeamResult(stopped), true);
    t.mock.restoreAll();
  }
});

test("双筋原始非物理预测保持原值，复核失败和未作全过程分析标记不丢失", async t => {
  const raw = resultFor("double-b");
  raw.predictions.As_required_mm2.value = -0.2;
  raw.comparisons.As_required_mm2.relative_error_percent = null;
  raw.prediction_review = { status: "invalid_input", reason: "原始预测面积不是正值", capacity_margin_kNm: null, numerical_checks_passed: false, ultimate_strain_full_analysis_performed: false };
  raw.warnings = ["保留原始预测，不能作为设计面积"];
  t.mock.method(globalThis, "fetch", async () => Response.json(raw));
  const response = await beamProxy(request(raw.inputs), "double-b");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), raw);
  assert.equal(isBeamResult(raw), true);
});

test("双筋A缺少受压输出、B伪造受压输出、调用状态冲突均拒绝展示", async t => {
  const missing = resultFor();
  delete missing.predictions.Asp_required_mm2;
  const extra = resultFor("double-b");
  extra.predictions.Asp_required_mm2 = prediction(500, "not-a-model");
  const conflict = { ...resultFor(), model_called: false };
  for (const malformed of [missing, extra, conflict]) {
    t.mock.method(globalThis, "fetch", async () => Response.json(malformed));
    assert.equal((await beamProxy(request(malformed.inputs), malformed.task)).status, 502);
    assert.equal(isBeamResult(malformed), false);
    t.mock.restoreAll();
  }
});
