"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, Check, ChevronDown, ChevronLeft, Download, Printer, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Markdown } from "./Markdown";
import { getQuestionCatalog, DIFFICULTY_LABELS, QUESTION_TYPE_LABELS, type QuestionDifficulty } from "@/lib/question-catalog";
import type { Question } from "@/lib/questions";
import { answerLabel, answerSession, createSession, DEFAULT_SETTINGS, displayPrompt, filterQuestions, parseQuestionCount, sampleQuestions, submitSession, summarizeSession, type TestSession } from "@/lib/self-test/model";
import { sessionStore } from "@/lib/self-test/store";
import { applySessionErrors, sessionWrongRecords } from "@/lib/wrongbook/model";
import { wrongbookStore } from "@/lib/wrongbook/store";
import { exportMarkdown, selectExportRecords, SCOPE_LABELS, TEMPLATE_LABELS, type ExportScope, type ExportTemplate } from "@/lib/wrongbook/export";
import { downloadMarkdown, printWrongbook } from "@/lib/wrongbook/browser-export";

const TYPES = Object.keys(QUESTION_TYPE_LABELS) as Question["type"][];
const LEVELS = Object.keys(DIFFICULTY_LABELS) as QuestionDifficulty[];
const STATUS_LABELS = { correct: "答对", wrong: "答错", pending: "待核对", unanswered: "未作答" };
const toggle = <T,>(values: T[], value: T) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];
const percent = (value: number) => `${Math.round(value * 100)}%`;
type Settings = { countText: string; types: Question["type"][]; levels: QuestionDifficulty[] };
const initialSettings: Settings = { countText: "10", types: DEFAULT_SETTINGS.types, levels: DEFAULT_SETTINGS.difficulties };
const LinkedPracticeView = dynamic(() => import("@/features/linked-practice/LinkedPracticeView"), { loading: () => <p className="kimi-quiet-state" role="status">正在读取关联练习…</p> });
const poolFor = (s: Settings) => filterQuestions(getQuestionCatalog(), { types: s.types, difficulties: s.levels });
function validate(s: Settings, available: number) {
  const count = parseQuestionCount(s.countText);
  return !s.types.length ? "至少选择一种题型" : !s.levels.length ? "至少选择一种难度" : !count ? "请输入有效题量" : !available ? "暂无符合条件的题目" : count > available ? `当前条件有 ${available} 题，请减少题量` : null;
}

/** D：单列、弱页签与渐进展开；复用现有控件和数据存储。 */
export function SelfTestView() {
  const saved = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getSnapshot);
  const book = useSyncExternalStore(wrongbookStore.subscribe, wrongbookStore.getSnapshot, wrongbookStore.getSnapshot);
  const session = saved.value;
  const [tab, setTab] = useState<"test" | "wrongbook" | "linked">("test");
  const [settings, setSettings] = useState(initialSettings), [draftSettings, setDraftSettings] = useState(initialSettings);
  const [settingsOpen, setSettingsOpen] = useState(false), [exportOpen, setExportOpen] = useState(false);
  const [bookType, setBookType] = useState("all"), [bookLevel, setBookLevel] = useState("all");
  const [selected, setSelected] = useState<string[]>([]), [onlyErrors, setOnlyErrors] = useState(false);
  const [scope, setScope] = useState<ExportScope>("session"), [template, setTemplate] = useState<ExportTemplate>("correction"), [limit, setLimit] = useState("all");
  const [confirmation, setConfirmation] = useState<{ kind: "submit" | "replace"; next?: TestSession } | null>(null);
  const [message, setMessage] = useState<string | null>(null), [exporting, setExporting] = useState(false);
  const questionRef = useRef<HTMLDivElement>(null);
  useEffect(() => { void sessionStore.initialize(); void wrongbookStore.initialize(); }, []);
  useEffect(() => {
    if (session?.status === "submitted" && book.writable && !book.value.appliedSessionIds.includes(session.id)) void wrongbookStore.update(state => applySessionErrors(state, session));
  }, [session, book.writable, book.value.appliedSessionIds]);
  useEffect(() => { if (tab === "test" && session?.status === "answering") questionRef.current?.focus({ preventScroll: true }); }, [session?.id, session?.cursor, session?.status, tab]);
  const available = useMemo(() => poolFor(settings), [settings]);
  const draftAvailable = useMemo(() => poolFor(draftSettings), [draftSettings]);
  const settingError = validate(settings, available.length), draftError = validate(draftSettings, draftAvailable.length);
  const filteredRecords = book.value.records.filter(r => (bookType === "all" || r.question.type === bookType) && (bookLevel === "all" || r.question.difficulty === bookLevel));
  const thisWrong = useMemo(() => sessionWrongRecords(session), [session]);
  const selectedIds = selected.filter(id => book.value.records.some(r => r.questionId === id));
  const exportRecords = selectExportRecords(scope === "session" ? thisWrong : book.value.records, scope, selectedIds, thisWrong.map(r => r.questionId), limit === "all" ? null : Number(limit) as 10 | 20);
  const canReplace = session?.status !== "submitted" || book.writable && !book.dirty && book.value.appliedSessionIds.includes(session.id);
  const replace = (next: TestSession) => {
    setMessage(null);
    if (!canReplace) { setMessage("错题尚未保存，请先重试保存。"); return; }
    if (session?.status === "answering") setConfirmation({ kind: "replace", next });
    else { void sessionStore.update(() => next); setTab("test"); setOnlyErrors(false); }
  };
  const start = () => { const count = parseQuestionCount(settings.countText); if (count && !settingError) replace(createSession(sampleQuestions(available, count))); };
  const submit = () => { void sessionStore.update(current => current ? submitSession(current) : current); setConfirmation(null); setOnlyErrors(false); };
  const runExport = async (print: boolean) => {
    setMessage(null); setExporting(true);
    try { const result = exportMarkdown(exportRecords, template, scope); if (print) await printWrongbook(result.markdown, result.filename); else downloadMarkdown(result.markdown, result.filename); }
    catch (error) { setMessage(error instanceof Error ? error.message : "导出失败，请重试"); }
    finally { setExporting(false); }
  };
  const move = (cursor: number) => void sessionStore.update(s => s ? { ...s, cursor } : s);
  const question = session?.questions[session.cursor], summary = session ? summarizeSession(session) : null;
  const unanswered = session?.questions.filter(q => !(session.answers[q.id] ?? "").trim()) ?? [];
  const typeSummary = settings.types.length === TYPES.length ? "全部题型" : settings.types.map(type => QUESTION_TYPE_LABELS[type]).join("、");
  const levelSummary = settings.levels.length === LEVELS.length ? "不限难度" : settings.levels.map(level => DIFFICULTY_LABELS[level]).join("、");
  const renderSettings = () => <Dialog open={settingsOpen} onOpenChange={open => { if (open) setDraftSettings(settings); setSettingsOpen(open); }}>
    <DialogTrigger asChild><Button variant="ghost" size="sm"><SlidersHorizontal />设置</Button></DialogTrigger>
    <DialogContent className="kimi-dialog"><DialogHeader><DialogTitle>自测设置</DialogTitle><DialogDescription>选好题量，即可开始。</DialogDescription></DialogHeader>
      <div className="space-y-6">
        <div className="space-y-2"><p className="text-sm">题量</p><div className="kimi-choice-pills">{[5, 10, 20, 30].map(value => <Button key={value} variant="ghost" aria-pressed={draftSettings.countText === String(value)} onClick={() => setDraftSettings(s => ({ ...s, countText: String(value) }))}>{value} 题</Button>)}<Input aria-label="自定义题量" inputMode="numeric" className="w-24" value={draftSettings.countText} onChange={event => setDraftSettings(s => ({ ...s, countText: event.target.value }))} /></div></div>
        <div className="space-y-2" role="group" aria-label="题型"><p className="text-sm">题型</p><div className="kimi-choice-pills">{TYPES.map(type => <Button key={type} variant="ghost" aria-pressed={draftSettings.types.includes(type)} onClick={() => setDraftSettings(s => ({ ...s, types: toggle(s.types, type) }))}>{QUESTION_TYPE_LABELS[type]}{draftSettings.types.includes(type) ? <Check className="size-3.5" /> : null}</Button>)}</div></div>
        <div className="space-y-2" role="group" aria-label="难度"><p className="text-sm">难度</p><div className="kimi-choice-pills">{LEVELS.map(level => <Button key={level} variant="ghost" aria-pressed={draftSettings.levels.includes(level)} onClick={() => setDraftSettings(s => ({ ...s, levels: toggle(s.levels, level) }))}>{DIFFICULTY_LABELS[level]}{draftSettings.levels.includes(level) ? <Check className="size-3.5" /> : null}</Button>)}</div></div>
        <p className="text-xs text-muted-foreground" role="status">可用 {draftAvailable.length} 题 · 已复核题库</p>
        {draftError ? <p role="alert" className="text-sm text-destructive">{draftError}{draftAvailable.length > 0 && parseQuestionCount(draftSettings.countText)! > draftAvailable.length ? <Button variant="link" size="sm" onClick={() => setDraftSettings(s => ({ ...s, countText: String(draftAvailable.length) }))}>使用 {draftAvailable.length} 题</Button> : null}</p> : null}
      </div>
      <DialogFooter><Button variant="ghost" onClick={() => setSettingsOpen(false)}>取消</Button><Button disabled={!!draftError || !saved.writable || !canReplace} onClick={() => { const count = parseQuestionCount(draftSettings.countText); if (count) { setSettings(draftSettings); setSettingsOpen(false); replace(createSession(sampleQuestions(draftAvailable, count))); } }}>{session ? "开始新自测" : "开始自测"}<ArrowRight /></Button></DialogFooter>
    </DialogContent>
  </Dialog>;
  const renderExport = () => <Dialog open={exportOpen} onOpenChange={open => { if (open) { setScope(tab === "wrongbook" ? selectedIds.length ? "selected" : "all" : "session"); setMessage(null); } setExportOpen(open); }}>
    <DialogTrigger asChild><Button variant="ghost" size="sm"><Download />导出错题</Button></DialogTrigger>
    <DialogContent className="kimi-dialog"><DialogHeader><DialogTitle>导出错题</DialogTitle><DialogDescription>保留解析，也可导出空白练习。</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <label className="kimi-field">范围<Select value={scope} onValueChange={value => setScope(value as ExportScope)}><SelectTrigger aria-label="导出范围"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SCOPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
        <label className="kimi-field">模板<Select value={template} onValueChange={value => setTemplate(value as ExportTemplate)}><SelectTrigger aria-label="导出模板"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TEMPLATE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
        <label className="kimi-field">题数<Select value={limit} onValueChange={setLimit}><SelectTrigger aria-label="导出题数"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">最近 10 题</SelectItem><SelectItem value="20">最近 20 题</SelectItem><SelectItem value="all">全部</SelectItem></SelectContent></Select></label>
        <p className="text-xs text-muted-foreground" role="status">{exportRecords.length ? `共 ${exportRecords.length} 题，最近答错的排在前面。` : "当前范围没有错题"}</p>
        {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
      </div>
      <DialogFooter><Button variant="outline" disabled={!exportRecords.length || exporting} onClick={() => void runExport(false)}><Download />Markdown</Button><Button disabled={!exportRecords.length || exporting} onClick={() => void runExport(true)}><Printer />{exporting ? "准备中…" : "打印 / PDF"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
  return <main className="kimi-page" aria-label="题库自测">
    <header className="kimi-page-heading"><div><h1>题库自测</h1><p>{tab === "linked" ? "从一道题开始，把相关知识串起来。" : "练习、核对，再把错题练一遍。"}</p></div><div className="kimi-actions">{tab !== "linked" ? <>{renderSettings()}{(tab === "wrongbook" || session?.status === "submitted") ? renderExport() : null}</> : null}</div></header>
    <div className="kimi-category-tabs" role="group" aria-label="自测页面"><Button variant="ghost" aria-pressed={tab === "test"} onClick={() => setTab("test")}>自测</Button><Button variant="ghost" aria-pressed={tab === "wrongbook"} onClick={() => setTab("wrongbook")}>错题本<span className="text-xs text-muted-foreground">{book.value.records.length}</span></Button><Button variant="ghost" aria-pressed={tab === "linked"} onClick={() => setTab("linked")}>关联练习</Button></div>
    {[{ snapshot: saved, store: sessionStore }, { snapshot: book, store: wrongbookStore }].map(({ snapshot, store }, i) => snapshot.error ? <div key={i} className="kimi-feedback" role="alert"><span>{snapshot.error}</span><Button variant="outline" size="sm" onClick={() => void store.retry()}><RefreshCw />{snapshot.writable ? "重试保存" : "重试读取"}</Button></div> : null)}
    {tab !== "linked" && message && !exportOpen ? <p role="alert" className="kimi-feedback text-destructive">{message}</p> : null}
    {tab === "linked" ? <LinkedPracticeView embedded /> : !saved.ready || !book.ready ? <p className="kimi-quiet-state" role="status">正在读取自测…</p> : <>
      {saved.dirty || book.dirty ? <p role="status" className="mb-4 text-xs text-muted-foreground">正在保存，请暂勿关闭页面。</p> : null}
      {!canReplace ? <p role="status" className="mb-4 text-xs text-muted-foreground">正在保存错题，完成后可开始新自测。</p> : null}
      {tab === "test" ? !session ? <Card className="kimi-stage"><CardContent className="kimi-start-state">
        <p className="kimi-eyebrow">第六章 · 练习</p><h2>从 {settings.countText} 道题开始</h2><p>{typeSummary} · {levelSummary}</p>
        <Button className="kimi-primary" disabled={!!settingError || !saved.writable} onClick={start}>开始自测<ArrowRight /></Button>
        {settingError ? <p role="alert" className="text-destructive">{settingError}</p> : null}<span className="text-xs text-muted-foreground">进度与错题保存在本机</span>
      </CardContent></Card> : session.status === "answering" && question ? <>
        <Card className="kimi-stage"><CardContent className="kimi-question-content" ref={questionRef} tabIndex={-1} aria-label={`第 ${session.cursor + 1} 题`}>
          <div className="kimi-row"><p className="text-sm">第 {session.cursor + 1} <span className="text-muted-foreground">/ {session.questions.length} 题</span></p>{session.cursor < session.questions.length - 1 ? <Button variant="ghost" size="sm" disabled={!saved.writable} onClick={() => unanswered.length ? setConfirmation({ kind: "submit" }) : submit()}>交卷</Button> : null}</div>
          <div className="kimi-progress" role="progressbar" aria-label="自测进度" aria-valuemin={0} aria-valuemax={summary!.total} aria-valuenow={summary!.answered}><span style={{ width: percent(summary!.completion) }} /></div>
          <p className="kimi-eyebrow">{QUESTION_TYPE_LABELS[question.type]} · {DIFFICULTY_LABELS[question.difficulty]}<span className="ml-3">{question.id}</span></p>
          <Markdown text={displayPrompt(question)} className="kimi-question-prompt" />
          {question.type === "fill" ? <label className="kimi-field">我的答案<Input aria-label="我的答案" placeholder="多空用分号分隔" autoComplete="off" value={session.answers[question.id] ?? ""} onChange={e => { const value = e.target.value; void sessionStore.update(s => s ? answerSession(s, question.id, value) : s); }} disabled={!saved.writable} /></label> : <div className="kimi-answer-options" role="group" aria-label="答案选项">{(question.type === "judge" ? [{ id: "T", text: "正确" }, { id: "F", text: "错误" }] : question.options).map(option => <Button key={option.id} variant="outline" aria-pressed={session.answers[question.id] === option.id} onClick={() => void sessionStore.update(s => s ? answerSession(s, question.id, option.id) : s)} disabled={!saved.writable}><span className="kimi-option-key">{option.id}</span><Markdown text={option.text} className="md-inline min-w-0" />{session.answers[question.id] === option.id ? <Check className="ml-auto text-[var(--kimi-accent)]" /> : null}</Button>)}</div>}
          <div className="kimi-question-footer"><Button variant="ghost" disabled={session.cursor === 0 || !saved.writable} onClick={() => move(session.cursor - 1)}><ChevronLeft />上一题</Button><span className="text-xs text-muted-foreground" role="status">已答 {summary!.answered} / {summary!.total}</span>{session.cursor < session.questions.length - 1 ? <Button className="kimi-primary" disabled={!saved.writable} onClick={() => move(session.cursor + 1)}>下一题<ArrowRight /></Button> : <Button className="kimi-primary" disabled={!saved.writable} onClick={() => unanswered.length ? setConfirmation({ kind: "submit" }) : submit()}>交卷<Check /></Button>}</div>
        </CardContent></Card>
        <details className="kimi-disclosure"><summary>答题卡<span>{unanswered.length ? `${unanswered.length} 题未答` : "全部已答"}<ChevronDown /></span></summary><div className="space-y-4 pt-4"><div className="kimi-question-grid">{session.questions.map((q, index) => <Button key={q.id} variant="ghost" aria-label={`第 ${index + 1} 题，${session.answers[q.id]?.trim() ? "已答" : "未答"}`} aria-pressed={index === session.cursor} data-answered={!!session.answers[q.id]?.trim()} onClick={() => move(index)} disabled={!saved.writable}>{index + 1}{session.answers[q.id]?.trim() ? <Check className="size-3" /> : null}</Button>)}</div>{unanswered.length ? <Button variant="ghost" size="sm" disabled={!saved.writable} onClick={() => move(session.questions.findIndex(q => !(session.answers[q.id] ?? "").trim()))}>跳到未答题<ArrowRight /></Button> : null}</div></details>
        {session.source === "wrongbook-snapshot" ? <p className="kimi-footnote">正在重练错题保存的版本，原记录会保留。</p> : null}
      </> : <>
        <Card className="kimi-stage"><CardContent className="kimi-result-summary"><div><p className="kimi-eyebrow">本次正确率</p><p className="kimi-score">{summary!.accuracy === null ? "—" : percent(summary!.accuracy)}</p><p className="text-xs text-muted-foreground">共 {summary!.total} 题 · 答对 {summary!.correct} · 答错 {summary!.wrong}{summary!.pending ? ` · 待核对 ${summary!.pending}` : ""}{summary!.unanswered ? ` · 未答 ${summary!.unanswered}` : ""}</p></div><Button className="kimi-primary" disabled={!saved.writable || !canReplace} onClick={() => replace(createSession(session.questions, session.source))}>再练一次<ArrowRight /></Button></CardContent></Card>
        <div className="kimi-row my-6"><p className="text-xs text-muted-foreground">{summary!.wrong ? `${summary!.wrong} 道错题${canReplace ? "已收录" : "待保存"}，展开查看解析。` : "展开题目，核对答案与解析。"}</p><Button variant="ghost" size="sm" aria-pressed={onlyErrors} onClick={() => setOnlyErrors(value => !value)}>{onlyErrors ? "查看全部" : "待复习"}</Button></div>
        <div className="kimi-review-list">{session.questions.map((q, index) => { const result = session.results[index]; if (onlyErrors && result.status === "correct") return null; return <details key={`${session.id}:${q.id}`} className="kimi-review-item" open={result.status !== "correct" ? true : undefined}><summary><span className="kimi-eyebrow">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><Markdown text={displayPrompt(q)} /><span className="kimi-eyebrow">{q.id} · {STATUS_LABELS[result.status]}</span></div><ChevronDown className="size-4 shrink-0" /></summary><div className="kimi-review-body">{q.type === "choice" ? q.options.map(o => <Markdown key={o.id} text={`${o.id}．${o.text}`} />) : null}<div className="kimi-answer-comparison"><div><p>我的答案</p><Markdown text={answerLabel(q, result.answer)} /></div><div><p>标准答案</p><Markdown text={answerLabel(q)} /></div></div><Markdown text={q.analysis?.trim() || "暂无解析"} /></div></details>; })}</div>
        <p className="kimi-footnote">正确率按可判定题目计算。未答与待核对题保留在本次结果中。</p>
      </> : <>
        <div className="kimi-row mb-5"><div className="kimi-actions"><Select value={bookType} onValueChange={setBookType}><SelectTrigger className="w-32" aria-label="错题题型"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部题型</SelectItem>{TYPES.map(type => <SelectItem key={type} value={type}>{QUESTION_TYPE_LABELS[type]}</SelectItem>)}</SelectContent></Select><Select value={bookLevel} onValueChange={setBookLevel}><SelectTrigger className="w-32" aria-label="错题难度"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部难度</SelectItem>{LEVELS.map(level => <SelectItem key={level} value={level}>{DIFFICULTY_LABELS[level]}</SelectItem>)}</SelectContent></Select></div><Button className="kimi-primary" disabled={!(selectedIds.length || filteredRecords.length) || !saved.writable || !canReplace} onClick={() => replace(createSession(book.value.records.filter(r => selectedIds.length ? selectedIds.includes(r.questionId) : filteredRecords.some(item => item.questionId === r.questionId)).map(r => r.question), "wrongbook-snapshot"))}>重练{selectedIds.length ? `所选 ${selectedIds.length} 题` : "错题"}<ArrowRight /></Button></div>
        {!filteredRecords.length ? <div className="kimi-quiet-state"><p>这里还没有错题</p><p>交卷后，答错的题会自动收录。</p><Button variant="outline" className="mt-5 rounded-full" onClick={() => { if (book.value.records.length) { setBookType("all"); setBookLevel("all"); } else setTab("test"); }}>{book.value.records.length ? "清除筛选" : "去自测"}</Button></div> : <>
          <div className="kimi-row mb-3"><p className="kimi-eyebrow">{filteredRecords.length} 题{selectedIds.length ? ` · 已选 ${selectedIds.length}` : ""}</p><Button variant="ghost" size="sm" onClick={() => setSelected(selectedIds.length ? [] : filteredRecords.map(r => r.questionId))}>{selectedIds.length ? "取消选择" : "全选"}</Button></div>
          <div className="kimi-review-list">{filteredRecords.map(record => <div key={record.questionId} className="kimi-wrongbook-row"><Button variant="ghost" size="icon" className="kimi-check-select" aria-label={`选择 ${record.questionId}`} aria-pressed={selected.includes(record.questionId)} onClick={() => setSelected(toggle(selected, record.questionId))}>{selected.includes(record.questionId) ? <Check /> : <span className="size-4 rounded border" />}</Button><details className="kimi-review-item min-w-0 flex-1"><summary><div className="min-w-0 flex-1"><Markdown text={displayPrompt(record.question)} /><span className="kimi-eyebrow">{record.questionId} · 答错 {record.wrongCount} 次</span></div><ChevronDown className="size-4 shrink-0" /></summary><div className="kimi-review-body">{record.question.type === "choice" ? record.question.options.map(o => <Markdown key={o.id} text={`${o.id}．${o.text}`} />) : null}<div className="kimi-answer-comparison"><div><p>最近答案</p><Markdown text={answerLabel(record.question, record.lastWrongAnswer)} /></div><div><p>标准答案</p><Markdown text={answerLabel(record.question, record.standardAnswer)} /></div></div><Markdown text={record.analysis?.trim() || "暂无解析"} /><div className="kimi-row"><Button variant="outline" disabled={!saved.writable || !canReplace} onClick={() => replace(createSession([record.question], "wrongbook-snapshot"))}>重练此题</Button><Button variant="ghost" size="sm" disabled={!book.writable} onClick={() => { void wrongbookStore.update(state => ({ ...state, records: state.records.filter(r => r.questionId !== record.questionId) })); setSelected(ids => ids.filter(id => id !== record.questionId)); }}><Trash2 />移出错题本</Button></div></div></details></div>)}</div>
          <p className="kimi-footnote">重练保留原题版本；答对后可手动移出。</p>
        </>}
      </>}
    </>}
    <Dialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null); }}><DialogContent className="kimi-dialog"><DialogHeader><DialogTitle>{confirmation?.kind === "submit" ? `还有 ${unanswered.length} 题未答` : "开始新的自测？"}</DialogTitle><DialogDescription>{confirmation?.kind === "submit" ? "未答题会保留在结果中，不计入错题本。" : "当前进度将被替换，已保存的错题会保留。"}</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setConfirmation(null)}>{confirmation?.kind === "submit" ? "继续作答" : "取消"}</Button><Button onClick={() => { if (confirmation?.kind === "submit") submit(); else if (confirmation?.next) { const next = confirmation.next; void sessionStore.update(() => next); setTab("test"); setOnlyErrors(false); setConfirmation(null); } }}>{confirmation?.kind === "submit" ? "确认交卷" : "开始自测"}</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}
