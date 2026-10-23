"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Plus, Radio, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Markdown } from "./Markdown";
import { copyText } from "@/lib/clipboard";
import { appPath } from "@/lib/app-path";
import { ClassroomApiError, classroomFetch, classroomRequestId, useClassroom } from "@/hooks/use-classroom";
import type { ClassroomSummary, PublicQuestion, TeacherSnapshot } from "@/lib/classroom/types";

const statusLabel = { waiting: "待上课", active: "上课中", ended: "已结束" };
const questionTypeLabel = { choice: "选择", judge: "判断", fill: "填空" };
const difficultyLabel: Record<string, string> = { easy: "简单", medium: "中等", hard: "困难" };

export function ClassroomView({ active = true }: { active?: boolean }) {
  const [auth, setAuth] = useState<"checking" | "anonymous" | "ready">("checking");
  const [configured, setConfigured] = useState(true);
  const [accessCode, setAccessCode] = useState(""), [title, setTitle] = useState("");
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]), [id, setId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<PublicQuestion[]>([]), [questionId, setQuestionId] = useState("");
  const [type, setType] = useState("all"), [difficulty, setDifficulty] = useState("all");
  const [invite, setInvite] = useState<{ url: string; svg: string } | null>(null), [inviteError, setInviteError] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [confirmEnd, setConfirmEnd] = useState(false);
  const [createOpen, setCreateOpen] = useState(false), [inviteOpen, setInviteOpen] = useState(false), [pickerOpen, setPickerOpen] = useState(false), [query, setQuery] = useState("");
  const actionRef = useRef<HTMLButtonElement>(null), endRef = useRef<HTMLButtonElement>(null);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const live = useClassroom<TeacherSnapshot>(id, false, active && auth === "ready");
  const c = live.state?.classroom, current = live.state?.rounds.at(-1);
  const [roundId, setRoundId] = useState("");
  const displayed = live.state?.rounds.find(r => r.id === roundId) ?? current;
  const filtered = catalog.filter(q => (type === "all" || q.type === type) && (difficulty === "all" || q.difficulty === difficulty) && `${q.id} ${q.prompt}`.toLowerCase().includes(query.trim().toLowerCase()));
  const refreshList = useCallback(async (signal?: AbortSignal) => {
    const result = await classroomFetch<{ classrooms: ClassroomSummary[] }>("/api/classrooms", undefined, signal);
    setClassrooms(result.classrooms); setAuth("ready");
    return result.classrooms;
  }, []);
  useEffect(() => {
    if (!active) return;
    const abort = new AbortController();
    void classroomFetch<{ configured: boolean }>("/api/classrooms/teacher-session", undefined, abort.signal).then(result => setConfigured(result.configured)).catch(() => {});
    void refreshList(abort.signal).then(list => {
      let previous: string | null = null;
      try { previous = localStorage.getItem(`ch6-teacher-classroom:${appPath("/")}`); } catch { /* Storage unavailable. */ }
      setId(prior => prior ?? (list.some(c => c.id === previous) ? previous : null));
      setError("");
    }).catch(err => {
      if (abort.signal.aborted) return;
      if (err instanceof ClassroomApiError && err.status === 401) setAuth("anonymous");
      else setError(err instanceof Error ? err.message : "获取课堂失败");
    });
    return () => abort.abort();
  }, [active, refreshList]);
  useEffect(() => {
    if (!active || auth !== "ready") return;
    const abort = new AbortController();
    void classroomFetch<{ questions: PublicQuestion[] }>("/api/classrooms/catalog", undefined, abort.signal).then(result => setCatalog(result.questions)).catch(err => { if (!abort.signal.aborted) setError(err.message); });
    return () => abort.abort();
  }, [active, auth]);
  useEffect(() => {
    setRoundId(""); setInvite(null); setInviteError("");
    if (id) try { localStorage.setItem(`ch6-teacher-classroom:${appPath("/")}`, id); } catch { /* Storage unavailable. */ }
  }, [id]);
  useEffect(() => {
    if (!active || !id || auth !== "ready") return;
    const abort = new AbortController();
    void classroomFetch<{ url: string; svg: string }>(`/api/classrooms/${id}/invite`, undefined, abort.signal).then(setInvite).catch(err => { if (!abort.signal.aborted) setInviteError(err.message); });
    return () => abort.abort();
  }, [active, id, auth]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : "操作失败，请重试"); }
    finally { setBusy(false); }
  };
  const login = (event: React.FormEvent) => {
    event.preventDefault(); void run(async () => {
      await classroomFetch("/api/classrooms/teacher-session", { accessCode }); setAccessCode(""); await refreshList();
    });
  };
  const commandId = (key: string) => {
    if (pending.current?.key !== key) pending.current = { key, id: classroomRequestId() };
    return pending.current.id;
  };
  const create = (event: React.FormEvent) => {
    event.preventDefault(); void run(async () => {
      const result = await classroomFetch<{ classroom: ClassroomSummary }>("/api/classrooms", { title, requestId: commandId("create:" + title) });
      pending.current = null; setId(result.classroom.id); setCreateOpen(false); setTitle(""); await refreshList();
    });
  };
  const command = (action: string, data: Record<string, unknown> = {}) => void run(async () => {
    const payload = action === "rounds" ? { ...data, requestId: commandId(`${id}:${action}:${JSON.stringify(data)}`) } : data;
    const result = await classroomFetch<TeacherSnapshot>(`/api/classrooms/${id}/${action}`, payload);
    live.accept(result); setPickerOpen(false); pending.current = null; setConfirmEnd(false); setRoundId(""); await refreshList();
  });
  const renderCreate = () => <Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); if (open) { setTitle("第六章 · 课堂练习"); setError(""); } }}>
    <DialogTrigger asChild><Button className="kimi-primary"><Plus />新建课堂</Button></DialogTrigger>
    <DialogContent className="kimi-dialog"><DialogHeader><DialogTitle>新建课堂</DialogTitle><DialogDescription>创建后，分享课堂码邀请学生。</DialogDescription></DialogHeader><form onSubmit={create} className="space-y-5"><label className="kimi-field">课堂名称<Input required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} /></label>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<DialogFooter><Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button><Button disabled={busy || !title.trim()} type="submit">{busy ? "创建中…" : "创建课堂"}<ArrowRight /></Button></DialogFooter></form></DialogContent>
  </Dialog>;
  const renderInvite = () => <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
    <DialogTrigger asChild><Button variant="outline" className="rounded-full"><Users />邀请学生</Button></DialogTrigger>
    <DialogContent className="kimi-dialog"><DialogHeader><DialogTitle>邀请学生</DialogTitle><DialogDescription>扫码或输入课堂码，即可加入。</DialogDescription></DialogHeader>
      <div className="flex flex-col items-center gap-5 py-3">{invite ? <img width={180} height={180} className="rounded-xl bg-white p-2" alt="学生入课二维码" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(invite.svg)}`} /> : <p role="status" className="text-sm">{inviteError || "正在准备邀请…"}</p>}<p className="text-[28px] font-medium tracking-[.2em]">{c?.code}</p></div>
      {invite ? <><Input aria-label="学生入课链接" readOnly value={invite.url} onFocus={e => e.target.select()} /><Button variant="outline" onClick={() => void copyText(invite.url).then(ok => setNotice(ok ? "入课链接已复制" : "请选中链接手动复制"))}><Copy />复制入课链接</Button></> : null}
      {notice ? <p role="status" className="text-center text-xs text-muted-foreground">{notice}</p> : null}
    </DialogContent>
  </Dialog>;
  const openPicker = () => { setQuestionId(""); setQuery(""); setPickerOpen(true); setError(""); };
  return <main className="kimi-page" aria-label="实时课堂">
    {id && auth === "ready" ? <Button variant="ghost" size="sm" className="kimi-back" onClick={() => { setId(null); setError(""); }}><ChevronLeft />我的课堂</Button> : null}
    <header className="kimi-page-heading"><div><h1>{c?.title || "实时课堂"}</h1><p>{c ? `${statusLabel[c.status]} · 课堂码 ${c.code} · ${live.state!.participants.length} 人加入` : "一起练习，及时看见每个人的思考。"}</p></div><div className="kimi-actions">{c && c.status !== "ended" ? renderInvite() : !id && auth === "ready" ? renderCreate() : null}{!id ? <Button asChild variant="ghost" size="sm"><a href={appPath("/join")}>学生入课<ArrowRight /></a></Button> : null}</div></header>
    {error && !createOpen && !pickerOpen ? <div className="kimi-feedback" role="alert"><span>{/CLASSROOM_DB_PATH|CLASSROOM_TEACHER_ACCESS_CODE/.test(error) ? "课堂暂未开放，请联系课程管理员。" : error}</span>{auth === "checking" ? <Button variant="outline" size="sm" onClick={() => window.location.reload()}><RefreshCw />重试</Button> : null}</div> : null}
    {notice && !inviteOpen ? <p role="status" className="mb-4 text-xs text-muted-foreground">{notice}</p> : null}
    {auth === "checking" ? <p role="status" className="kimi-quiet-state">正在连接课堂…</p> : auth === "anonymous" ? <Card className="kimi-stage"><CardContent className="kimi-auth-content"><h2>教师入口</h2><p>使用教师访问码进入课堂。</p><form className="space-y-4" onSubmit={login}><label className="kimi-field">访问码<Input type="password" autoComplete="current-password" maxLength={256} value={accessCode} onChange={e => setAccessCode(e.target.value)} required /></label>{!configured ? <p role="alert" className="text-sm text-muted-foreground">教师端暂未开放，请联系课程管理员。</p> : null}<Button className="kimi-primary w-full" disabled={busy || !accessCode.trim() || !configured}>{busy ? "验证中…" : "进入课堂"}<ArrowRight /></Button></form></CardContent></Card> : !id ? <section className="mt-8" aria-label="我的课堂">
      {classrooms.length ? <div className="kimi-classroom-list">{classrooms.map(item => <Button key={item.id} variant="ghost" className="kimi-classroom-row" onClick={() => { setId(item.id); setError(""); }}><span className="kimi-list-icon"><Radio /></span><span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{statusLabel[item.status]} · {item.code}</span></span><ChevronRight className="text-muted-foreground" /></Button>)}</div> : <div className="kimi-quiet-state"><Radio className="mx-auto mb-4 size-6 text-muted-foreground" /><p>开始第一堂课</p><p>新建课堂，邀请学生一起练习。</p></div>}
    </section> : <>
      <div className="kimi-row mb-6"><p className="kimi-eyebrow" role="status">{live.connection}</p><div className="kimi-actions"><Button variant="ghost" size="icon" title="重新同步" aria-label="重新同步" onClick={live.refresh}><RefreshCw /></Button>{c && c.status !== "ended" ? <Button ref={endRef} variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmEnd(true)}>结束课堂</Button> : null}</div></div>
      {live.error ? <div className="kimi-feedback" role="alert"><span>{live.error}</span>{live.expired ? <Button size="sm" onClick={() => { setAuth("anonymous"); setId(null); }}>重新验证</Button> : <Button size="sm" variant="outline" onClick={live.refresh}>重试</Button>}</div> : null}
      {c ? <>
        {c.status === "waiting" ? <Card className="kimi-stage"><CardContent className="kimi-start-state"><p className="kimi-eyebrow">准备上课</p><h2>{live.state!.participants.length ? `${live.state!.participants.length} 位同学已就位` : "等待同学加入"}</h2><p>分享课堂码 {c.code}，也可开课后继续邀请。</p><Button className="kimi-primary" disabled={busy} onClick={() => command("start")}>开始上课<ArrowRight /></Button></CardContent></Card> : displayed ? <Card className="kimi-stage"><CardContent className="kimi-question-content">
          <div className="kimi-row"><p className="kimi-eyebrow">第 {displayed.sequence} 题 · {displayed.status === "open" ? "正在作答" : displayed.status === "closed" ? "已收题" : "已公布"}</p>{live.state!.rounds.length > 1 ? <Select value={displayed.id} onValueChange={setRoundId}><SelectTrigger className="w-36" aria-label="查看轮次"><SelectValue /></SelectTrigger><SelectContent>{live.state!.rounds.map(r => <SelectItem key={r.id} value={r.id}>第 {r.sequence} 题 · {r.question.id}</SelectItem>)}</SelectContent></Select> : <span className="kimi-eyebrow">{displayed.question.id}</span>}</div>
          <Markdown text={displayed.question.prompt} className="kimi-question-prompt" />
          {displayed.question.type !== "fill" ? <div className="kimi-distribution">{(displayed.question.type === "judge" ? [{ id: "T", text: "正确" }, { id: "F", text: "错误" }] : displayed.question.options).map(o => <div key={o.id} className="kimi-distribution-row"><span className="kimi-option-key">{o.id}</span><Markdown text={o.text} className="md-inline min-w-0 flex-1" /><span className="text-xs text-muted-foreground">{displayed.stats.distribution[o.id] ?? 0} 人</span><span className="kimi-distribution-bar" style={{ width: `${live.state!.participants.length ? (displayed.stats.distribution[o.id] ?? 0) / live.state!.participants.length * 100 : 0}%` }} /></div>)}</div> : null}
          <div className="kimi-row border-t pt-5"><p className="text-sm" role="status">已答 <span className="font-medium tabular-nums">{displayed.stats.submitted}/{live.state!.participants.length}</span><span className="ml-3 text-xs text-muted-foreground">未答 {displayed.stats.unanswered} · 答对 {displayed.stats.correct}{displayed.stats.pending ? ` · 待核对 ${displayed.stats.pending}` : ""}</span></p><div className="kimi-actions">{c.status !== "ended" && displayed.id === current?.id && displayed.status === "open" ? <Button ref={actionRef} className="kimi-primary" disabled={busy} onClick={() => command(`rounds/${displayed.id}/close`)}>收题<Check /></Button> : null}{c.status !== "ended" && displayed.id === current?.id && displayed.status === "closed" ? <Button ref={actionRef} className="kimi-primary" disabled={busy} onClick={() => command(`rounds/${displayed.id}/reveal`)}>公布答案<ArrowRight /></Button> : null}{c.status !== "ended" && current?.status !== "open" && displayed.id === current?.id && displayed.status === "revealed" ? <Button ref={actionRef} className="kimi-primary" disabled={busy} onClick={openPicker}>下一题<ArrowRight /></Button> : null}{displayed.id !== current?.id ? <Button variant="outline" onClick={() => setRoundId("")}>回到当前题</Button> : null}</div></div>
          <details className="kimi-disclosure"><summary>答案与解析<span><ChevronDown /></span></summary><div className="space-y-3 pt-4"><Markdown text={`标准答案：${displayed.answer ?? ""}`} />{displayed.analysis ? <Markdown text={displayed.analysis} /> : null}</div></details>
        </CardContent></Card> : c.status === "active" ? <Card className="kimi-stage"><CardContent className="kimi-start-state"><p className="kimi-eyebrow">课堂已开始</p><h2>发一道题，一起想一想</h2><p>从已复核题库中选择，实时查看作答。</p><Button ref={actionRef} className="kimi-primary" disabled={busy} onClick={openPicker}>选择题目<ArrowRight /></Button></CardContent></Card> : <p className="kimi-quiet-state">课堂已结束</p>}
        {live.state!.participants.length || displayed ? <details className="kimi-disclosure mt-6"><summary>{displayed ? "作答名单" : "已加入同学"}<span>{live.state!.participants.length} 人<ChevronDown /></span></summary><div className="overflow-x-auto pt-4"><table className="kimi-table"><caption className="sr-only">学生作答名单</caption><thead><tr><th>姓名 / 学号</th>{displayed ? <><th>答案</th><th>状态</th></> : null}</tr></thead><tbody>{live.state!.participants.map(p => { const s = displayed?.submissions.find(s => s.participantId === p.id); return <tr key={p.id}><td>{p.name}{p.studentNo ? <span className="ml-2 text-muted-foreground">{p.studentNo}</span> : null}</td>{displayed ? <><td className="max-w-sm whitespace-pre-wrap break-words">{s?.answer ?? "—"}</td><td className="whitespace-nowrap">{!s ? "未答" : s.grade === true ? "答对" : s.grade === false ? "答错" : "待核对"}</td></> : null}</tr>; })}</tbody></table></div></details> : null}
        {c.status === "ended" ? <p className="kimi-footnote">课堂已结束，记录仍可查看。</p> : null}
      </> : !live.error ? <p role="status" className="kimi-quiet-state">正在获取课堂…</p> : null}
    </>}
    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}><DialogContent className="kimi-dialog kimi-question-picker" onCloseAutoFocus={event => { event.preventDefault(); actionRef.current?.focus(); }}><DialogHeader><DialogTitle>选择题目</DialogTitle><DialogDescription>选择后发布到当前课堂。</DialogDescription></DialogHeader>
      <Input aria-label="搜索课堂题目" placeholder="搜索题号或内容" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="kimi-actions"><Select value={type} onValueChange={v => { setType(v); setQuestionId(""); }}><SelectTrigger className="w-32" aria-label="题型筛选"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部题型</SelectItem><SelectItem value="choice">选择</SelectItem><SelectItem value="judge">判断</SelectItem><SelectItem value="fill">填空</SelectItem></SelectContent></Select><Select value={difficulty} onValueChange={v => { setDifficulty(v); setQuestionId(""); }}><SelectTrigger className="w-32" aria-label="难度筛选"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部难度</SelectItem>{[...new Set(catalog.map(q => q.difficulty).filter((d): d is string => Boolean(d)))].map(d => <SelectItem key={d} value={d}>{difficultyLabel[d] ?? d}</SelectItem>)}</SelectContent></Select><span className="kimi-eyebrow">{filtered.length} 题</span></div>
      <div className="kimi-picker-list" role="group" aria-label="选择课堂题目">{filtered.length ? filtered.map(q => <Button key={q.id} variant="ghost" className="kimi-picker-row" aria-pressed={questionId === q.id} onClick={() => setQuestionId(q.id)}><span className="min-w-0 flex-1 text-left"><span className="kimi-eyebrow">{q.id} · {questionTypeLabel[q.type]}</span><Markdown text={q.prompt} className={questionId === q.id ? "" : "line-clamp-2"} /></span>{questionId === q.id ? <Check className="text-[var(--kimi-accent)]" /> : null}</Button>) : <p className="kimi-quiet-state">没有匹配题目，试试其他关键词。</p>}</div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<DialogFooter><Button variant="ghost" onClick={() => setPickerOpen(false)}>取消</Button><Button disabled={busy || !questionId || current?.status === "open"} onClick={() => command("rounds", { questionId })}>{busy ? "发布中…" : "发布题目"}<ArrowRight /></Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}><DialogContent className="kimi-dialog" onCloseAutoFocus={event => { event.preventDefault(); endRef.current?.focus(); }}><DialogHeader><DialogTitle>结束课堂？</DialogTitle><DialogDescription>停止加入和作答，课堂记录会保留。</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setConfirmEnd(false)}>继续上课</Button><Button disabled={busy} onClick={() => command("end")}>确认结束</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}
