"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Markdown } from "./Markdown";
import { appPath } from "@/lib/app-path";
import type { StudentSnapshot } from "@/lib/classroom/types";
import { classroomFetch, classroomRequestId, useClassroom } from "@/hooks/use-classroom";

export function StudentClassroom({ code: initialCode = "" }: { code?: string }) {
  const [code, setCode] = useState(initialCode), [name, setName] = useState(""), [studentNo, setStudentNo] = useState("");
  const [id, setId] = useState<string | null>(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [draft, setDraft] = useState(""), [submissionStatus, setSubmissionStatus] = useState("");
  const retry = useRef<{ round: string; answer: string; id: string } | null>(null);
  const live = useClassroom<StudentSnapshot>(id, true, true);
  const current = live.state?.rounds.at(-1);
  const currentRound = useRef(current?.id); currentRound.current = current?.id;
  const storageKey = `ch6-classroom:${appPath("/")}:${initialCode}`;
  const draftKey = current ? `ch6-classroom-draft:${appPath("/")}:${id}:${current.id}` : "";
  useEffect(() => {
    if (initialCode) try { setId(localStorage.getItem(storageKey)); } catch { /* Cookie supports rejoin. */ }
    setReady(true);
  }, [initialCode, storageKey]);
  useEffect(() => {
    let value = current?.submission?.answer ?? "";
    if (current?.status === "open") try { value = sessionStorage.getItem(draftKey) ?? value; } catch { /* Draft remains in memory. */ }
    else if (draftKey) try { sessionStorage.removeItem(draftKey); } catch { /* Optional local draft. */ }
    setDraft(value); setSubmissionStatus(""); retry.current = null;
  }, [current?.id, current?.status, draftKey]); // Same-round snapshots must not overwrite unsent edits.
  const edit = (value: string) => {
    setDraft(value); setSubmissionStatus("");
    try { sessionStorage.setItem(draftKey, value); } catch { /* In-memory fallback. */ }
  };
  const join = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await classroomFetch("/api/classroom-participation/session", {});
      const result = await classroomFetch<{ classroomId: string }>("/api/classroom-participation/join", { code, name, studentNo });
      try { localStorage.setItem(`ch6-classroom:${appPath("/")}:${code}`, result.classroomId); } catch { /* Cookie remains usable. */ }
      if (initialCode === code) setId(result.classroomId); else window.location.assign(appPath(`/join/${code}`));
    } catch (err) { setError(err instanceof Error ? err.message : "加入失败，请重试"); }
    finally { setBusy(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!current || !id) return;
    const round = current.id, answer = draft.trim();
    if (!retry.current || retry.current.round !== round || retry.current.answer !== answer) retry.current = { round, answer, id: classroomRequestId() };
    setBusy(true); setSubmissionStatus("提交中…"); setError("");
    try {
      const result = await classroomFetch<StudentSnapshot>(`/api/classroom-participation/${id}/rounds/${round}/answer`, { answer, requestId: retry.current.id });
      live.accept(result);
      if (currentRound.current === round) { setSubmissionStatus("已提交"); retry.current = null; }
    } catch (err) { if (currentRound.current === round) { setSubmissionStatus("提交失败，可重试"); setError(err instanceof Error ? err.message : "提交失败，请重试"); } }
    finally { setBusy(false); }
  };
  const reset = () => { try { localStorage.removeItem(storageKey); } catch { /* Cookie supports rejoin. */ } setId(null); setError(""); };
  const canAnswer = current?.status === "open" && live.state?.classroom.status !== "ended";
  const changed = draft.trim() !== (current?.submission?.answer ?? "");
  return <div className="kimi-student-shell">
    <header className="kimi-toolbar"><span>第六章 · 课堂</span><Button variant="ghost" size="sm" className="ml-auto" asChild><a href={appPath("/")}><ChevronLeft />返回学习</a></Button></header>
    <main className="kimi-page" aria-label="学生课堂">
      {!ready ? <p role="status" className="kimi-quiet-state">正在恢复课堂…</p> : !id ? <>
        <header className="kimi-page-heading"><div><h1>加入课堂</h1><p>输入课堂码，和同学一起练习。</p></div></header>
        <Card className="kimi-stage mt-8"><CardContent className="kimi-auth-content"><form onSubmit={join} className="space-y-5">
          <label className="kimi-field">课堂码<Input name="code" placeholder="6 位数字" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} autoComplete="off" /></label>
          <label className="kimi-field">姓名<Input name="name" placeholder="让老师认出你" maxLength={60} required value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
          <details className="kimi-disclosure"><summary>填写学号<span className="text-xs text-muted-foreground">选填<ChevronDown /></span></summary><label className="sr-only" htmlFor="student-number">学号</label><Input id="student-number" name="studentNo" className="mt-3" maxLength={80} value={studentNo} onChange={e => setStudentNo(e.target.value)} /></details>
          <Button type="submit" className="kimi-primary w-full" disabled={busy || !name.trim() || !/^\d{6}$/.test(code)}>{busy ? "加入中…" : "加入课堂"}<ArrowRight /></Button>
        </form></CardContent></Card>
      </> : <>
        <header className="kimi-page-heading"><div><h1>{live.state?.classroom.title || "课堂"}</h1><p>{live.state ? `${live.state.participant.name} · 课堂码 ${live.state.classroom.code}` : "正在连接课堂…"}</p></div><Button variant="ghost" size="icon" aria-label="重新同步" title="重新同步" onClick={live.refresh}><RefreshCw /></Button></header>
        <p className="kimi-eyebrow my-6" role="status">{live.connection}</p>
        {live.error ? <div role="alert" className="kimi-feedback"><span>{live.error}</span><Button variant="outline" size="sm" onClick={live.expired ? reset : live.refresh}>{live.expired ? "重新入课" : "重试"}</Button></div> : null}
        {live.state ? <>
          {!current ? <Card className="kimi-stage"><CardContent className="kimi-start-state"><p className="kimi-eyebrow">{live.state.classroom.status === "ended" ? "已结束" : "已加入课堂"}</p><h2>{live.state.classroom.status === "ended" ? "下次课堂见" : live.state.classroom.status === "waiting" ? "等老师开始上课" : "等老师发题"}</h2><p>{live.state.classroom.status === "ended" ? "感谢参与。" : "题目会自动出现在这里。"}</p></CardContent></Card> : <Card className="kimi-stage" role="region" aria-label="当前课堂题目"><CardContent className="kimi-question-content">
            <div className="kimi-row"><p className="kimi-eyebrow">第 {current.sequence} 题 · {current.question.type === "choice" ? "选择" : current.question.type === "judge" ? "判断" : "填空"}</p><span className="kimi-eyebrow">{canAnswer ? "作答中" : current.status === "revealed" ? "已公布" : "已收题"}</span></div>
            <Markdown text={current.question.prompt} className="kimi-question-prompt" />
            <form onSubmit={submit} className="space-y-5">
              {current.question.type === "fill" ? <label className="kimi-field">你的答案<Input aria-label="你的答案" placeholder="多空用分号分隔" maxLength={2000} value={draft} onChange={e => edit(e.target.value)} disabled={!canAnswer || busy} /></label> : <fieldset className="kimi-answer-options" disabled={!canAnswer || busy}><legend className="sr-only">选择答案</legend>{(current.question.type === "judge" ? [{ id: "T", text: "正确" }, { id: "F", text: "错误" }] : current.question.options).map(o => <Button key={o.id} type="button" variant="outline" aria-pressed={draft === o.id} onClick={() => edit(o.id)}><span className="kimi-option-key">{o.id}</span><Markdown text={o.text} className="md-inline min-w-0" />{draft === o.id ? <Check className="ml-auto text-[var(--kimi-accent)]" /> : null}</Button>)}</fieldset>}
              <div className="kimi-row border-t pt-5"><p role="status" className="text-xs text-muted-foreground">{submissionStatus || (canAnswer ? current.submission ? changed ? "修改后请再次提交" : "已提交，收题前可修改" : "选好答案后提交" : current.status === "revealed" ? "答案已公布" : "等待老师公布答案")}</p>{canAnswer ? <Button type="submit" className="kimi-primary" disabled={busy || !draft.trim() || !changed || live.expired}>{busy ? "提交中…" : current.submission ? "更新答案" : "提交答案"}<ArrowRight /></Button> : null}</div>
            </form>
            {current.status === "revealed" ? <div className="kimi-revealed"><p className="mb-3 text-sm font-medium">{current.submission?.grade === true ? "回答正确" : current.submission?.grade === false ? "再想一想这道题" : current.submission ? "待老师核对" : "本题未作答"}</p><Markdown text={`标准答案：${current.answer ?? ""}`} />{current.analysis ? <Markdown text={current.analysis} /> : null}</div> : null}
          </CardContent></Card>}
          {live.state.rounds.length > 1 ? <details className="kimi-disclosure mt-6"><summary>之前的题目<span>{live.state.rounds.length - 1} 题<ChevronDown /></span></summary><div className="kimi-review-list mt-4">{live.state.rounds.slice(0, -1).reverse().map(r => <details className="kimi-review-item" key={r.id}><summary><span className="kimi-eyebrow">{r.sequence}</span><div className="min-w-0 flex-1"><Markdown text={r.question.prompt} /></div><ChevronDown className="size-4" /></summary><div className="kimi-review-body"><p className="text-sm">{r.submission ? `我的答案：${r.submission.answer}` : "未作答"}</p>{r.status === "revealed" ? <><Markdown text={`标准答案：${r.answer}`} />{r.analysis ? <Markdown text={r.analysis} /> : null}</> : <p className="text-xs text-muted-foreground">答案尚未公布</p>}</div></details>)}</div></details> : null}
          {live.state.classroom.status === "ended" && current ? <p role="status" className="kimi-footnote">课堂已结束，感谢参与。</p> : null}
        </> : !live.error ? <p role="status" className="kimi-quiet-state">正在获取课堂…</p> : null}
        <Button variant="ghost" size="sm" asChild className="mt-6 text-muted-foreground"><a href={appPath("/join")}>加入其他课堂<ArrowRight /></a></Button>
      </>}
      {error ? <p role="alert" className="kimi-feedback text-destructive">{error}</p> : null}
    </main>
  </div>;
}
