"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Markdown } from "./Markdown";
import { useAiDrawer } from "./AiDrawer";
import { useNotes } from "./notes";
import type { PageCtx } from "@/lib/useChat";

export type Question = {
  id: string;
  type: "choice" | "fill" | "judge";
  prompt: string;
  options?: { id: string; text: string }[];
  answer?: string | null;
  analysis?: string | null;
  verified?: boolean;
};

const TYPE_LABEL: Record<Question["type"], string> = { choice: "选择", judge: "判断", fill: "填空" };

/* ------------------------------ 判定 ------------------------------ */

/** 全角→半角 */
function toHalfWidth(s: string): string {
  return s
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ");
}

/** 归一化：去空白、统一括号、去句末/句读标点、转小写 */
function norm(s: string): string {
  return toHalfWidth(String(s ?? ""))
    .replace(/\s+/g, "")
    .replace(/[()]/g, "")
    .replace(/[。，、；：？！"'“”‘’~～]/g, "")
    .toLowerCase();
}

/** 选项字母 / T-F 归一化 */
function normLetter(v: string): string {
  const t = norm(v);
  if (/^(t|true|正确|对|√|是)$/.test(t)) return "T";
  if (/^(f|false|错误|错|×|否)$/.test(t)) return "F";
  const m = t.match(/^[a-z]/);
  return m ? m[0].toUpperCase() : t.slice(0, 1).toUpperCase();
}

/** 取出第一个数字，用来比较 0.518 / .518 / 518mm 这类等价写法 */
function numOf(s: string): number | null {
  const m = s.match(/[-+]?\d*\.?\d+/);
  if (!m) return null;
  const v = Number.parseFloat(m[0]);
  return Number.isFinite(v) ? v : null;
}

export function grade(q: Question, value: string): boolean {
  const ans = (q.answer ?? "").trim();
  const v = (value ?? "").trim();
  if (!ans || !v) return false;

  if (q.type === "choice" || q.type === "judge") {
    const a = normLetter(ans);
    const b = normLetter(v);
    return a !== "" && a === b;
  }

  // 填空：多空按 ； 拆分，逐空做归一化比较 / 数值比较 / 包含匹配
  const parts = ans
    .split(/[;；]/)
    .map(norm)
    .filter(Boolean);
  const input = norm(v);
  const vn = numOf(input);

  const matchOne = (p: string) => {
    if (input === p) return true;
    const pn = numOf(p);
    if (vn !== null && pn !== null && Math.abs(vn - pn) < 1e-6) return true;
    if (p.length >= 2 && input.includes(p)) return true;
    if (input.length >= 2 && p.includes(input) && input.length >= p.length * 0.5) return true;
    return false;
  };

  return parts.every((p) => {
    // 答案里带「或」的是等价写法，命中任意一种就算对
    const alts = p.split(/或|\//).filter((x) => x.length >= 2);
    return alts.length > 1 ? alts.some(matchOne) : matchOne(p);
  });
}

/** 正确答案的可读形式 */
function answerLabel(q: Question): string {
  const a = (q.answer ?? "").trim();
  if (!a) return "暂无答案";
  if (q.type === "choice") {
    const opt = (q.options ?? []).find((o) => normLetter(o.id) === normLetter(a));
    return opt ? `${a}．${opt.text}` : a;
  }
  if (q.type === "judge") return normLetter(a) === "T" ? "正确" : normLetter(a) === "F" ? "错误" : a;
  return a;
}

/* --------------------------- 选题 --------------------------- */

/**
 * 题目没有 section 字段，用当前节名（去掉 K 编号）的中文词元去匹配题干/解析。
 * 优先取「有答案 + verified」的题；本节匹配不到就退回其余题。
 */
export function pickQuestions(questions: Question[], section: string, n = 3): Question[] {
  const name = section.replace(/^K\d+\s*/, "");
  const toks = new Set<string>();
  for (const m of name.matchAll(/[\u4e00-\u9fff]{2,3}/g)) toks.add(m[0]);

  const usable = questions.filter(
    (q) => q.answer && (q.type !== "choice" || (q.options?.length ?? 0) > 0),
  );
  const verified = usable.filter((q) => q.verified === true);
  const base = verified.length >= n ? verified : usable;

  const score = (q: Question) => {
    const hay = `${q.prompt} ${q.analysis ?? ""} ${(q.options ?? []).map((o) => o.text).join(" ")}`;
    let s = 0;
    for (const t of toks) if (hay.includes(t)) s += t.length;
    return s;
  };
  const scored = base.map((q) => ({ q, s: score(q) })).sort((a, b) => b.s - a.s);
  const hits = scored.filter((x) => x.s > 0).map((x) => x.q);
  const rest = scored.filter((x) => x.s === 0).map((x) => x.q);
  return [...hits, ...rest].slice(0, n);
}

/* --------------------------- 面板 --------------------------- */

type QState = { value: string; submitted: boolean; correct: boolean | null; showAnswer: boolean };

const EMPTY: QState = { value: "", submitted: false, correct: null, showAnswer: false };

export function PracticePanel({
  questions,
  context,
}: {
  questions: Question[];
  context: PageCtx;
}) {
  const { ask } = useAiDrawer();
  const { add } = useNotes();
  const [states, setStates] = useState<Record<string, QState>>({});

  const st = (id: string): QState => states[id] ?? EMPTY;
  const patch = (id: string, p: Partial<QState>) =>
    setStates((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY), ...p } }));

  const list = useMemo(() => questions, [questions]);

  if (!list.length) return null;

  return (
    <div className="space-y-2.5">
      {list.map((q) => {
        const s = st(q.id);
        const hasAnswer = Boolean(q.answer);
        const opts = q.options ?? [];

        const submit = () => patch(q.id, { submitted: true, correct: grade(q, s.value) });
        const reset = () => patch(q.id, EMPTY);

        return (
          <Card key={q.id} className="rounded-xl border-paper-line bg-paper px-3 py-3 shadow-none">
            <div className="flex items-center gap-2">
              <span className="text-[11px] tabular-nums text-ink-faint">{q.id}</span>
              <span className="rounded-full border border-paper-line px-1.5 py-[1px] text-[10.5px] text-ink-faint">
                {TYPE_LABEL[q.type]}
              </span>
              {q.verified === false ? (
                <span className="text-[10.5px] text-ink-faint">未复核</span>
              ) : null}
            </div>

            <div className="mt-1.5 text-[13px] leading-6 text-ink-soft">
              <Markdown text={q.prompt.replace(/_{2,}/g, "＿＿＿＿")} />
            </div>

            {/* 作答区 */}
            {opts.length ? (
              <div className="mt-2 space-y-1">
                {opts.map((o) => {
                  const picked = s.value === o.id;
                  const right = s.submitted && normLetter(o.id) === normLetter(q.answer ?? "");
                  const wrong = s.submitted && picked && !right;
                  return (
                    <Button
                      key={o.id}
                      type="button"
                      variant="outline"
                      onClick={() => patch(q.id, { value: o.id, submitted: false, correct: null })}
                      className={`h-auto w-full items-start justify-start gap-2 whitespace-normal rounded-lg px-2.5 py-2 text-left text-[12.5px] font-normal leading-5 shadow-none ${
                        right
                          ? "border-ink bg-paper-soft text-ink hover:bg-paper-soft hover:text-ink"
                          : wrong
                            ? "border-ink-faint bg-paper-soft text-ink-faint line-through hover:bg-paper-soft hover:text-ink-faint"
                            : picked
                              ? "border-ink bg-paper-soft text-ink hover:bg-paper-soft hover:text-ink"
                              : "border-paper-line text-ink-soft hover:bg-paper-soft hover:text-ink-soft"
                      }`}
                    >
                      <span className="shrink-0 tabular-nums text-ink-faint">{o.id}</span>
                      <span className="min-w-0 flex-1">{o.text}</span>
                    </Button>
                  );
                })}
              </div>
            ) : (
              <Input
                value={s.value}
                onChange={(e) => patch(q.id, { value: e.target.value, submitted: false, correct: null })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                placeholder={q.type === "fill" ? "把答案填在这里" : "输入你的答案"}
                className="mt-2 h-auto border-paper-line bg-paper px-2.5 py-2 text-[12.5px] text-ink shadow-none placeholder:text-ink-faint focus-visible:ring-ink-faint"
              />
            )}

            {/* 操作区 */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {!hasAnswer ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    ask({
                      question: `这道题我没有标准答案，能不能一步步带我做：${q.prompt}`,
                      context,
                    })
                  }
                  className="border-paper-line text-ink-soft shadow-none hover:bg-paper-soft"
                >
                  暂无标准答案，问 AI
                </Button>
              ) : !s.submitted ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={submit}
                    disabled={!s.value.trim()}
                    className="bg-ink text-paper hover:bg-ink/90"
                  >
                    提交
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => patch(q.id, { showAnswer: true })}
                    className="text-ink-faint hover:bg-transparent hover:text-ink"
                  >
                    不会做，直接看答案
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-[11.5px] font-medium">
                    {s.correct ? "答对了" : "答错了"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => patch(q.id, { showAnswer: !s.showAnswer })}
                    className="border-paper-line text-ink-soft shadow-none hover:bg-paper-soft"
                  >
                    {s.showAnswer ? "收起答案" : "查看答案"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    className="text-ink-faint hover:bg-transparent hover:text-ink"
                  >
                    再做一次
                  </Button>
                  {!s.correct ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        add({
                          kind: "question",
                          title: q.id,
                          text: `题目：${q.prompt}\n我的作答：${s.value}\n这道题我做错了。`,
                        })
                      }
                      className="text-ink-faint hover:bg-transparent hover:text-ink"
                    >
                      收藏这道题
                    </Button>
                  ) : null}
                </>
              )}
            </div>

            {/* 答案区：答错或主动点开才显示 */}
            {s.showAnswer && hasAnswer ? (
              <div className="mt-2 rounded-lg bg-paper-soft px-2.5 py-2">
                <div className="text-[12px] leading-5 text-ink">答案：{answerLabel(q)}</div>
                {q.analysis ? (
                  <div className="mt-1 text-[12px] leading-5 text-ink-soft">{q.analysis}</div>
                ) : null}
                {q.verified === false ? (
                  <div className="mt-1 text-[11px] text-ink-faint">该题答案未经复核，仅供参考。</div>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    ask({
                      question: `我不太懂这道题：${q.prompt}\n答案是 ${answerLabel(q)}，但我没看懂，能不能一步步讲？`,
                      context,
                    })
                  }
                  className="mt-2 border-paper-line bg-paper text-ink-soft shadow-none hover:border-ink-faint hover:bg-paper hover:text-ink"
                >
                  还是不懂，问 AI
                </Button>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
