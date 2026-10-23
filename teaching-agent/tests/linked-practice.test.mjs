import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_INFO, DEFAULT_PROFILE, EMPTY_STATE, chooseNextQuestion, currentQuestion, currentResult,
  exportLinkedMarkdown, filterLinkedQuestions, followRecommendation, getLinkedCatalog, getLinkedRelations,
  openQuestion, recommendLinkedQuestions, startLinkedPractice, submitLinkedAnswer, summarizeLinkedAttempts,
} from "../src/features/linked-practice/model.ts";
import { decodeLinkedState, LINKED_STORAGE_KEY } from "../src/features/linked-practice/store.ts";
import { createPersistentStore, localStorageAdapter } from "../src/lib/self-test/persistence.ts";

test("关联题池独立，待复核题和悬空关联不进入运行目录", () => {
  const catalog = getLinkedCatalog();
  const ids = new Set(catalog.map(question => question.id));
  assert.equal(catalog.length, 610);
  assert.equal(ids.size, 610);
  assert.ok(catalog.every(question => question.id.startsWith("MY-")));
  assert.equal(CATALOG_INFO.quarantinedCount, 14);
  for (const id of ["MY-BANK-DOUBLE-CALCULATION-014", "MY-BANK-DOUBLE-CALCULATION-032", "MY-DEMO-DOUBLE-CALCULATION-006"])
    assert.equal(ids.has(id), false);
  assert.equal(getLinkedRelations().length, 22);
  assert.ok(getLinkedRelations().every(edge => ids.has(edge.fromId) && ids.has(edge.toId)));
});

test("主题和题型筛选交集正确，默认从有已知关联的锚点开始", () => {
  for (const topic of ["single", "double"]) {
    const pool = filterLinkedQuestions({ topic, filter: "objective" });
    assert.ok(pool.length && pool.every(question => question.topic === topic && ["judge", "choice"].includes(question.type)));
    const state = startLinkedPractice(EMPTY_STATE, { topic, filter: "objective" });
    assert.ok(currentQuestion(state).isAnchor);
    assert.equal(state.attempts.length, 0);
  }
  assert.ok(filterLinkedQuestions({ topic: "double", filter: "calculation" }).every(question => question.type === "calculation"));
});

test("参考答案核对只记录一次，空作答不会生成错误记录", () => {
  let state = startLinkedPractice(EMPTY_STATE, DEFAULT_PROFILE);
  assert.throws(() => submitLinkedAnswer(state), /先选/);
  const question = currentQuestion(state);
  state = submitLinkedAnswer({ ...state, draft: question.answerValue }, undefined, 1, "first");
  assert.equal(currentResult(state).outcome, "correct");
  assert.equal(currentResult(state).method, "reference-check");
  assert.equal(submitLinkedAnswer(state), state);
  assert.equal(state.attempts.length, 1);
  state.attempts[0].question.options[0].text = "snapshot-only";
  assert.notEqual(currentQuestion(state).options[0].text, "snapshot-only");
});

test("答错到前置基础再返回原题，保留原错误和自评记录", () => {
  let state = startLinkedPractice(EMPTY_STATE, { topic: "double", filter: "objective" });
  const original = currentQuestion(state);
  assert.equal(original.sourceAlias, "P-027");
  state = submitLinkedAnswer({ ...state, draft: original.answerValue === "T" ? "F" : "T" }, undefined, 1, "wrong");
  const foundation = recommendLinkedQuestions(state).find(item => item.relation === "prerequisite");
  assert.ok(foundation);
  state = followRecommendation(state, foundation);
  assert.equal(state.returnToId, original.id);
  assert.equal(currentQuestion(state).type, "fill");
  assert.throws(() => submitLinkedAnswer(state, "correct"), /先对照/);
  state = submitLinkedAnswer({ ...state, revealed: true, draft: "我的作答" }, "correct", 2, "self");
  assert.equal(currentResult(state).method, "self-report");
  assert.deepEqual(summarizeLinkedAttempts(state.attempts), { checked: 1, correct: 0, selfReviewed: 1, needsPractice: 1 });
  const back = recommendLinkedQuestions(state).find(item => item.relation === "return");
  state = followRecommendation(state, back);
  assert.equal(state.currentId, original.id);
  assert.equal(state.resultId, null);
  assert.equal(state.draft, "");
  assert.equal(state.returnToId, null);
  assert.equal(state.attempts.length, 2);
});

test("同主题补练不会被标为已证实的前置依赖", () => {
  const question = getLinkedCatalog().find(question => question.type === "judge" && question.topic === "single" && !getLinkedRelations().some(edge => edge.fromId === question.id));
  let state = openQuestion(EMPTY_STATE, question.id);
  state = submitLinkedAnswer({ ...state, draft: question.answerValue }, undefined, 1, "fallback");
  const suggestions = recommendLinkedQuestions(state);
  assert.ok(suggestions.length);
  assert.ok(suggestions.every(item => item.relation === "same-topic"));
  assert.ok(suggestions.every(item => item.label === "同主题练习"));
});

test("推荐入口按关系合并，避免出现含义相同的重复按钮", () => {
  let state = startLinkedPractice(EMPTY_STATE, { topic: "double", filter: "objective" });
  state = submitLinkedAnswer({ ...state, draft: currentQuestion(state).answerValue }, undefined, 1, "recommend-dedup");
  const recommendations = recommendLinkedQuestions(state);
  assert.equal(new Set(recommendations.map(item => item.relation)).size, recommendations.length);
  assert.equal(new Set(recommendations.map(item => item.label)).size, recommendations.length);
  assert.ok(recommendations.length >= 2);
});

test("跳过和题池耗尽不会冒充错误作答", () => {
  let state = startLinkedPractice(EMPTY_STATE, DEFAULT_PROFILE);
  state = chooseNextQuestion(state);
  assert.equal(state.attempts.length, 0);
  state = { ...state, seenIds: filterLinkedQuestions(DEFAULT_PROFILE).map(question => question.id) };
  assert.equal(chooseNextQuestion(state).screen, "start");
  assert.equal(state.attempts.length, 0);
});

test("草稿、参考解答和返回原题上下文可恢复，旧版题目更新不误判", () => {
  const state = { ...startLinkedPractice(EMPTY_STATE, DEFAULT_PROFILE), draft: "B", context: "补基础", returnToId: "MY-DEMO-DOUBLE-JUDGE-001" };
  const decoded = decodeLinkedState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(decoded, state);
  assert.equal(currentQuestion({ ...decoded, currentHash: "stale-hash" }), undefined);
  for (const invalid of [{}, { ...state, version: 2 }, { ...state, draft: null }, { ...state, resultId: "missing" }])
    assert.throws(() => decodeLinkedState(invalid), /格式无效/);
});

test("持久化只写独立key，读取损坏时不覆盖已有记录", async () => {
  const values = new Map([["ch6-self-test-v1", "old-self-test"], ["classroom", "old-classroom"]]);
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  try {
    const store = createPersistentStore(localStorageAdapter(LINKED_STORAGE_KEY, EMPTY_STATE, decodeLinkedState), EMPTY_STATE, "关联练习");
    await store.update(value => ({ ...value, screen: "history" }));
    assert.equal(JSON.parse(values.get(LINKED_STORAGE_KEY)).screen, "history");
    assert.equal(values.get("ch6-self-test-v1"), "old-self-test");
    assert.equal(values.get("classroom"), "old-classroom");
    values.set(LINKED_STORAGE_KEY, "{broken");
    const broken = createPersistentStore(localStorageAdapter(LINKED_STORAGE_KEY, EMPTY_STATE, decodeLinkedState), EMPTY_STATE, "关联练习");
    assert.equal(await broken.update(value => ({ ...value, draft: "must-not-overwrite" })), false);
    assert.equal(values.get(LINKED_STORAGE_KEY), "{broken");
    assert.equal(broken.getSnapshot().writable, false);
  } finally { globalThis.localStorage = previous; }
});

test("保存失败保留本轮内存，重试后写入同一份答卷", async () => {
  let fail = true, written;
  const store = createPersistentStore({ read: async () => EMPTY_STATE, write: async value => { if (fail) throw Error("quota"); written = value; } }, EMPTY_STATE, "关联练习");
  await store.update(value => ({ ...value, draft: "saved-in-memory" }));
  assert.equal(store.getSnapshot().value.draft, "saved-in-memory");
  assert.equal(store.getSnapshot().dirty, true);
  fail = false;
  await store.retry();
  assert.equal(written.draft, "saved-in-memory");
  assert.equal(store.getSnapshot().dirty, false);
});

test("导出保留题目快照、原资料来源和自评区别", () => {
  let state = startLinkedPractice(EMPTY_STATE, { topic: "single", filter: "fill" });
  state = submitLinkedAnswer({ ...state, draft: "示例回答", revealed: true }, "wrong", 1, "export");
  const markdown = exportLinkedMarkdown(state);
  assert.match(markdown, /自评/);
  assert.match(markdown, /参考答案/);
  assert.match(markdown, /马跃题库|关联示范/);
  assert.match(markdown, /示例回答/);
});
