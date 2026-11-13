/** 让练习视图用指定的题开一组自测（搜索结果、首页「去练 3 题」都用它）。 */
export const PRACTICE_START_EVENT = "ch6:practice-start";

export function requestPractice(questionIds: string[]) {
  window.dispatchEvent(new CustomEvent<string[]>(PRACTICE_START_EVENT, { detail: questionIds }));
}

/** 切到练习的某个页签（专项练习覆盖 K2–K6 的大部分题） */
export const PRACTICE_TAB_EVENT = "ch6:practice-tab";
export function requestPracticeTab(tab: "test" | "wrongbook" | "linked") {
  window.dispatchEvent(new CustomEvent<string>(PRACTICE_TAB_EVENT, { detail: tab }));
}
