"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Download, PenLine, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NoteEditor, exportNotePdf, useNotes, type Note } from "@/components/notes";
import { KNOWLEDGE_SECTIONS } from "@/lib/sections";
import { requestStudySection } from "@/lib/study-nav";
import { appPath } from "@/lib/app-path";
import type { AppView } from "@/lib/views";

const KINDS = [["all", "全部"], ["page", "课件页"], ["element", "课件选段"], ["text", "对话"], ["question", "题目"]] as const;
const kOf = (n: Note) => /K(1[0-4]|[1-9])\b/.exec(`${n.title} ${n.text}`)?.[0] ?? null;
const pageOf = (n: Note) => Number(/第\s*(\d+)\s*页/.exec(n.title)?.[1] ?? /slide-(\d{3})/.exec(n.image ?? "")?.[1] ?? 0) || null;
const when = (t: number) => new Date(t).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });

/** 笔记页：按知识点分组，可搜索、筛选、编辑、跳回课件、导出 PDF */
export function NotesPage({ onView }: { onView: (v: AppView) => void }) {
  const { notes, remove } = useNotes();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("all");
  const [editing, setEditing] = useState<Note | null>(null);
  const [exporting, setExporting] = useState(false);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = notes.filter(n => (kind === "all" || n.kind === kind) && (!q || `${n.title} ${n.text}`.toLowerCase().includes(q)));
    const map = new Map<string, Note[]>();
    for (const n of list) { const k = kOf(n) ?? "other"; map.set(k, [...(map.get(k) ?? []), n]); }
    const order = [...KNOWLEDGE_SECTIONS.map(s => s.id as string), "other"];
    return order.filter(k => map.has(k)).map(k => ({ k, name: k === "other" ? "其他" : `${k} ${KNOWLEDGE_SECTIONS.find(s => s.id === k)?.name}`, items: map.get(k)!.sort((a, b) => b.at - a.at) }));
  }, [notes, query, kind]);

  const jump = (n: Note) => { const k = kOf(n); const page = pageOf(n); if (k) { requestStudySection(k, page ?? undefined); onView("slides"); } };

  return (
    <main className="kimi-page" aria-label="笔记">
      <header className="kimi-page-heading">
        <div><h1>笔记</h1></div>
        <div className="kimi-actions">
          <label className="relative w-full sm:w-56"><Search aria-hidden className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="搜索笔记" placeholder="搜索笔记" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" /></label>
          <Button variant="outline" className="rounded-full" disabled={!notes.length || exporting} onClick={() => { setExporting(true); void exportNotePdf(notes).finally(() => setExporting(false)); }}><Download />{exporting ? "正在汇总…" : "导出 PDF"}</Button>
        </div>
      </header>
      <div className="kimi-category-tabs" role="group" aria-label="笔记类型">{KINDS.map(([id, label]) => <Button key={id} variant="ghost" aria-pressed={kind === id} onClick={() => setKind(id)}>{label}</Button>)}</div>
      {!notes.length ? (
        <div className="notes-empty">
          <span className="notes-empty-icon"><PenLine /></span>
          <p className="font-serif-cn text-[20px]">还没有笔记</p>
          <p className="text-[13px] text-muted-foreground">在课件上点书签或选中文字，在对话里选中回答，都能收进来</p>
          <Button className="kimi-primary mt-4" onClick={() => onView("slides")}>去看课件<ArrowUpRight /></Button>
        </div>
      ) : !groups.length ? <p className="kimi-quiet-state">没有匹配的笔记</p> : groups.map(g => (
        <section key={g.k} className="notes-group">
          <h2 className="notes-group-title"><span className="font-serif-cn">{g.name}</span><span className="notes-count">{g.items.length}</span></h2>
          <div className="notes-grid">
            <AnimatePresence initial={false}>
              {g.items.map(n => (
                <motion.article key={n.id} layout className="note-card" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}>
                  {n.image ? <button type="button" className="note-img" onClick={() => jump(n)} tabIndex={-1} aria-hidden="true"><img src={appPath(n.image)} alt="" loading="lazy" /></button> : null}
                  <div className="note-body">
                    <p className="note-meta"><span>{KINDS.find(k => k[0] === n.kind)?.[1]}</span><span>{when(n.at)}</span></p>
                    <p className="note-title">{n.title}</p>
                    {n.text ? <p className="note-text">{n.text}</p> : null}
                  </div>
                  <div className="note-actions">
                    {kOf(n) ? <Button variant="ghost" size="sm" onClick={() => jump(n)}>回课件<ArrowUpRight /></Button> : null}
                    <Button variant="ghost" size="icon" aria-label="编辑笔记" onClick={() => setEditing(n)}><PenLine /></Button>
                    <Button variant="ghost" size="icon" aria-label="删除笔记" onClick={() => remove(n.id)}><Trash2 /></Button>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          </div>
        </section>
      ))}
      <NoteEditor note={editing} onClose={() => setEditing(null)} />
    </main>
  );
}
