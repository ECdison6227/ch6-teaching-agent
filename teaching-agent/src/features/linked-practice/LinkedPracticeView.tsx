"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, Check, ChevronLeft, Download, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Markdown } from "@/components/Markdown";
import { downloadMarkdown } from "@/lib/wrongbook/browser-export";
import { linkedStore } from "./store";
import { formatLinkedText } from "./text";
import {
  CATALOG_INFO, FILTER_LABELS, TOPIC_LABELS, TYPE_LABELS,
  chooseNextQuestion, currentQuestion, currentResult, exportLinkedMarkdown, filterLinkedQuestions,
  followRecommendation, getLinkedQuestion, isAutomatic, openQuestion, recommendLinkedQuestions,
  startLinkedPractice, submitLinkedAnswer, summarizeLinkedAttempts,
  type Attempt, type Filter, type LinkedState, type Profile,
} from "./model";

const serverSnapshot = linkedStore.getSnapshot();
const outcomeText = (attempt: Attempt) => attempt.method === "self-report"
  ? attempt.outcome === "correct" ? "已掌握 · 自评" : "待巩固 · 自评"
  : attempt.outcome === "correct" ? "答对了" : "再巩固一下";

export default function LinkedPracticeView({ embedded = false }: { embedded?: boolean }) {
  const saved = useSyncExternalStore(linkedStore.subscribe, linkedStore.getSnapshot, () => serverSnapshot);
  const state = saved.value;
  const question = currentQuestion(state);
  const result = currentResult(state);
  const recommendations = recommendLinkedQuestions(state);
  const summary = summarizeLinkedAttempts(state.attempts);
  const [profile, setProfile] = useState<Profile>(state.profile);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [record, setRecord] = useState<Attempt | null>(null);
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => { void linkedStore.initialize(); }, []);
  useEffect(() => { if (saved.ready) setProfile(state.profile); }, [saved.ready, state.profile]);
  useEffect(() => { if (state.screen === "practice" && !state.resultId) heading.current?.focus(); }, [state.currentId, state.resultId, state.screen]);
  const update = (transform: (value: LinkedState) => LinkedState) => {
    setMessage(null);
    setMessageIsError(false);
    void linkedStore.update(transform).catch((error: unknown) => { setMessageIsError(true); setMessage(error instanceof Error ? error.message : "操作未完成，请重试。"); });
  };
  const onQuestion = (transform: (value: LinkedState) => LinkedState) => update(value => value.currentId === question?.id ? transform(value) : value);
  const start = () => {
    update(value => startLinkedPractice(value, profile));
    setSettingsOpen(false); setConfirmStart(false);
  };
  const settingsFields = <div className="space-y-5">
    <div className="space-y-2"><p className="text-sm">主题</p><div className="kimi-choice-pills" role="group" aria-label="练习主题">
      {(["single", "double"] as const).map(topic => <Button key={topic} variant="ghost" aria-pressed={profile.topic === topic} onClick={() => setProfile(value => ({ ...value, topic }))}>{TOPIC_LABELS[topic]}{profile.topic === topic ? <Check className="size-3.5" /> : null}</Button>)}
    </div></div>
    <label className="kimi-field">题型<Select value={profile.filter} onValueChange={value => setProfile(current => ({ ...current, filter: value as Filter }))}>
      <SelectTrigger aria-label="关联练习题型"><SelectValue /></SelectTrigger><SelectContent>
        {Object.entries(FILTER_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
      </SelectContent>
    </Select></label>
    <p className="text-xs text-muted-foreground" role="status">{filterLinkedQuestions(profile).length} 题{["fill", "calculation"].includes(profile.filter) ? " · 对照解答后自评" : ""}</p>
  </div>;
  const remaining = filterLinkedQuestions(state.profile).filter(item => !state.seenIds.includes(item.id)).length;
  const finished = !!state.currentId && !!result && remaining === 0;
  const history = state.screen === "history";
  const actions = <div className="kimi-actions">
    {state.screen === "practice" ? <Button variant="ghost" size="sm" onClick={() => { setProfile(state.profile); setSettingsOpen(true); }}><SlidersHorizontal />设置</Button> : null}
    {!embedded ? <Button variant="ghost" size="sm" onClick={() => setInfoOpen(true)}>题库说明</Button> : null}
  </div>;
  const Shell = embedded ? "section" : "main";
  return <Shell className={embedded ? "" : "kimi-page"} aria-label="关联练习">
    {embedded ? state.screen === "practice" ? <div className="mb-3 flex justify-end">{actions}</div> : null : <header className="kimi-page-heading">
      <div><h1>关联练习</h1><p>从一道题开始，把相关知识串起来。</p></div>
      {actions}
    </header>}
    <div className="kimi-category-tabs" role="group" aria-label="关联练习页面">
      <Button variant="ghost" aria-pressed={!history} onClick={() => update(value => ({ ...value, screen: value.currentId && currentQuestion(value) ? "practice" : "start" }))}>练习</Button>
      <Button variant="ghost" aria-pressed={history} onClick={() => update(value => ({ ...value, screen: "history" }))}>学习记录<span className="text-xs text-muted-foreground">{state.attempts.length}</span></Button>
    </div>
    {saved.error ? <div role="alert" className="kimi-feedback mb-4"><span>{saved.error}</span><Button variant="outline" size="sm" onClick={() => void linkedStore.retry()}><RefreshCw />{saved.writable ? "重试保存" : "重试读取"}</Button></div> : null}
    {saved.dirty && !saved.error ? <p role="status" className="mb-3 text-xs text-muted-foreground">正在保存…</p> : null}
    {message ? <p role={messageIsError ? "alert" : "status"} className={"kimi-feedback mb-4 " + (messageIsError ? "text-destructive" : "text-muted-foreground")}>{message}</p> : null}
    {!saved.ready ? <div role="status" aria-label="正在读取关联练习"><Skeleton className="h-8 w-44" /><Skeleton className="mt-5 h-72 w-full rounded-2xl" /></div>
      : history ? <>
        <div className="kimi-row mb-4">
          <p className="text-sm text-muted-foreground">{summary.checked ? "核对 " + summary.checked + " 题 · 答对 " + summary.correct + " 题" : "还没有核对记录"}{summary.selfReviewed ? " · 自评 " + summary.selfReviewed + " 题" : ""}</p>
          <Button variant="ghost" size="sm" disabled={!state.attempts.length} onClick={() => { try { downloadMarkdown(exportLinkedMarkdown(state), "关联练习-学习记录.md"); setMessageIsError(false); setMessage("已发起下载，请查看浏览器下载记录。"); } catch { setMessageIsError(true); setMessage("导出失败，请重试。"); } }}><Download />导出记录</Button>
        </div>
        {!state.attempts.length ? <Card className="kimi-stage"><div className="kimi-start-state"><h2>从第一道题开始</h2><p>每次作答和补练都会保存在这里。</p><Button className="kimi-primary" disabled={!saved.writable} onClick={() => update(value => ({ ...value, screen: "start" }))}>去练习<ArrowRight /></Button></div></Card>
          : <ol className="divide-y divide-border/60">{[...state.attempts].reverse().map(attempt => <li key={attempt.id} className="flex items-start justify-between gap-4 py-5">
            <div className="min-w-0"><p className="text-xs text-muted-foreground">{TOPIC_LABELS[attempt.question.topic]} · {TYPE_LABELS[attempt.question.type]}</p><p className="my-2 line-clamp-2 text-sm leading-6">{attempt.question.prompt}</p><p className="text-xs text-muted-foreground">{outcomeText(attempt)}</p></div>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setRecord(attempt)}>查看</Button>
          </li>)}</ol>}
      </> : state.screen !== "practice" || !question ? <Card className="kimi-stage">
        <CardContent className="px-6 py-8 sm:px-8">
          <div className="mb-7"><h2 className="text-xl font-medium">{finished ? "这一组练完了" : "今天练哪个主题？"}</h2><p className="mt-2 text-sm text-muted-foreground">{state.currentId && !question ? "当前题目已更新，选择主题开始新练习。" : "选好主题，直接开始。答完再决定要不要补基础。"}</p></div>
          {settingsFields}
          <div className="kimi-actions mt-7">
            {question && !finished ? <Button className="kimi-primary" disabled={!saved.writable} onClick={() => update(value => ({ ...value, screen: "practice" }))}>继续练习<ArrowRight /></Button> : null}
            <Button variant={question && !finished ? "outline" : "default"} className="rounded-full" disabled={!saved.writable || !filterLinkedQuestions(profile).length} onClick={() => { if (state.draft && !state.resultId) { setPendingQuestionId(null); setConfirmStart(true); } else start(); }}>{question ? "开始新练习" : "开始练习"}<ArrowRight /></Button>
          </div>
        </CardContent>
      </Card> : <>
        <div className="kimi-row mb-4">
          <Button variant="ghost" size="sm" onClick={() => update(value => ({ ...value, screen: "start" }))}><ChevronLeft />返回</Button>
          <p className="text-xs text-muted-foreground">{TOPIC_LABELS[question.topic]} · {TYPE_LABELS[question.type]}{!isAutomatic(question) ? " · 自评练习" : ""}</p>
        </div>
        {state.context ? <p className="mb-4 text-xs leading-6 text-muted-foreground">{state.context}</p> : null}
        <Card className="kimi-stage mt-0">
          <CardContent className="kimi-question-content">
            <div ref={heading} tabIndex={-1} className="kimi-question-prompt outline-none"><Markdown text={formatLinkedText(question.prompt)} /></div>
            {isAutomatic(question) ? <div className="kimi-answer-options" role="group" aria-label="你的答案">
              {(question.type === "judge" ? [{ id: "T", text: "正确" }, { id: "F", text: "错误" }] : question.options).map(option => <Button key={option.id} variant="outline" aria-pressed={state.draft === option.id} disabled={!!result || !saved.writable} onClick={() => update(value => value.currentId === question.id && !value.resultId ? { ...value, draft: option.id } : value)}>
                <span className="kimi-option-key">{option.id}</span><Markdown text={formatLinkedText(option.text)} />
              </Button>)}
            </div> : <label className="kimi-field">你的答案或思路<Input aria-label="你的答案或思路" value={state.draft} disabled={!!result || state.revealed || !saved.writable} placeholder={question.type === "fill" ? "先填一下，再核对" : "先自己算一算，记下结果"} onChange={event => { const draft = event.target.value; onQuestion(value => !value.revealed ? { ...value, draft } : value); }} /></label>}
            {!result && !state.revealed ? <div className="kimi-question-footer">
              <span className="text-xs text-muted-foreground">{isAutomatic(question) ? "提交后查看参考答案" : "填空与计算按参考解答自评"}</span>
              <div className="kimi-actions"><Button variant="ghost" disabled={!saved.writable} onClick={() => onQuestion(chooseNextQuestion)}>跳过</Button>
                <Button className="kimi-primary" disabled={!saved.writable || isAutomatic(question) && !state.draft} onClick={() => onQuestion(value => isAutomatic(question) ? submitLinkedAnswer(value) : { ...value, revealed: true })}>{isAutomatic(question) ? "提交答案" : "对照解答"}<ArrowRight /></Button>
              </div>
            </div> : null}
            {state.revealed ? <div className="space-y-5 border-t border-border/60 pt-6" aria-live="polite">
              <div><p className="text-sm font-medium">{result ? outcomeText(result) : "对照一下，再记录掌握情况"}</p><p className="mt-1 text-xs text-muted-foreground">{result?.method === "reference-check" ? "按资料参考答案核对" : "自评记录不计入自动判分正确率"}</p></div>
              <div><p className="mb-2 text-xs text-muted-foreground">参考答案</p><Markdown text={formatLinkedText(question.answerRaw)} /></div>
              {question.analysis ? <details className="kimi-disclosure" open={!result || result.outcome === "wrong"}><summary>查看解析</summary><div className="pt-4"><Markdown text={formatLinkedText(question.analysis)} /></div></details> : null}
              {!result ? <div className="kimi-actions"><Button variant="outline" disabled={!saved.writable} onClick={() => onQuestion(value => submitLinkedAnswer(value, "wrong"))}>还需练习</Button><Button className="kimi-primary" disabled={!saved.writable} onClick={() => onQuestion(value => submitLinkedAnswer(value, "correct"))}>我掌握了<Check /></Button></div> : <>
                {recommendations.length ? <div><p className="mb-3 text-sm">接着练</p><div className="kimi-actions">{recommendations.map(item => <Button key={item.question.id} variant="outline" className="h-auto min-h-9 rounded-full py-2" disabled={!saved.writable} onClick={() => onQuestion(value => followRecommendation(value, item))}>{item.label}<span className="text-xs text-muted-foreground">{TYPE_LABELS[item.question.type]}</span><ArrowRight /></Button>)}</div></div> : null}
                <div className="kimi-question-footer"><Button variant="ghost" disabled={!saved.writable} onClick={() => onQuestion(value => openQuestion(value, question.id, { returnToId: value.returnToId }))}>重做这道题</Button><Button className="kimi-primary" disabled={!saved.writable} onClick={() => onQuestion(chooseNextQuestion)}>{remaining ? "下一题" : "完成这组"}<ArrowRight /></Button></div>
              </>}
            </div> : null}
          </CardContent>
        </Card>
        <details className="kimi-disclosure mt-4"><summary>题目来源</summary><p className="pt-3 text-xs leading-6 text-muted-foreground">{question.sourceLabel}{question.sourceAlias ? " · " + question.sourceAlias : ""} · {question.category}</p></details>
      </>}
    <Dialog open={settingsOpen} onOpenChange={open => { setSettingsOpen(open); if (!open) setProfile(state.profile); }}><DialogContent className="kimi-dialog"><DialogHeader><DialogTitle>练习设置</DialogTitle><DialogDescription>开始新练习会替换当前草稿，已保存的记录保留。</DialogDescription></DialogHeader>{settingsFields}<DialogFooter><Button variant="ghost" onClick={() => { setSettingsOpen(false); setProfile(state.profile); }}>取消</Button><Button disabled={!saved.writable || !filterLinkedQuestions(profile).length} onClick={start}>开始新练习<ArrowRight /></Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={confirmStart} onOpenChange={open => { setConfirmStart(open); if (!open) setPendingQuestionId(null); }}><DialogContent className="kimi-dialog"><DialogHeader><DialogTitle>{pendingQuestionId ? "切换练习？" : "开始新练习？"}</DialogTitle><DialogDescription>当前未提交的答案将被替换，已有学习记录保留。</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => { setConfirmStart(false); setPendingQuestionId(null); }}>取消</Button><Button onClick={() => { if (pendingQuestionId) { const id = pendingQuestionId; update(value => openQuestion(value, id)); setConfirmStart(false); setPendingQuestionId(null); } else start(); }}>{pendingQuestionId ? "切换练习" : "开始新练习"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={infoOpen} onOpenChange={setInfoOpen}><DialogContent className="kimi-dialog"><DialogHeader><DialogTitle>关于关联练习</DialogTitle><DialogDescription>独立练习，按已有知识关系补基础、换角度。</DialogDescription></DialogHeader><div className="space-y-3 text-sm leading-7 text-muted-foreground"><p>当前收录 {CATALOG_INFO.questionCount} 条结构完整记录，{CATALOG_INFO.quarantinedCount} 条待复核内容暂未开放。</p><p>判断、选择按资料答案核对；填空、计算对照解答后自评。关联推荐来自资料整理，同主题补练会另行标明。</p><p>记录保存在本机，与题库自测、实时课堂分别保存。可在学习记录中导出。</p></div></DialogContent></Dialog>
    <Dialog open={!!record} onOpenChange={open => { if (!open) setRecord(null); }}><DialogContent className="kimi-dialog"><DialogHeader><DialogTitle>学习记录</DialogTitle><DialogDescription>{record ? outcomeText(record) : ""}</DialogDescription></DialogHeader>{record ? <div className="space-y-5"><Markdown text={formatLinkedText(record.question.prompt)} /><p className="text-sm">你的答案：{record.answer || "对照解答后自评"}</p><div><p className="mb-2 text-xs text-muted-foreground">参考答案</p><Markdown text={formatLinkedText(record.question.answerRaw)} /></div><details className="kimi-disclosure"><summary>查看解析</summary><div className="pt-3"><Markdown text={formatLinkedText(record.question.analysis)} /></div></details><p className="text-xs text-muted-foreground">{record.question.sourceLabel}{record.question.sourceAlias ? " · " + record.question.sourceAlias : ""}</p></div> : null}<DialogFooter><Button variant="ghost" onClick={() => setRecord(null)}>关闭</Button>{record && getLinkedQuestion(record.question.id)?.contentHash === record.question.contentHash ? <Button onClick={() => { const id = record.question.id; setRecord(null); if (state.draft && !state.resultId) { setPendingQuestionId(id); setConfirmStart(true); } else update(value => openQuestion(value, id)); }}>再练一次<ArrowRight /></Button> : null}</DialogFooter></DialogContent></Dialog>
  </Shell>;
}
