"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import elementsJson from "@/content/slide-elements.json";
import slidesJson from "@/content/slides.json";

export type NoteKind = "text" | "page" | "element" | "question";

export type Note = {
  id: string;
  kind: NoteKind;
  title: string;
  text: string;
  image?: string;
  at: number;
};

const KEY = "ch6-notes-v2";

type SlideMeta = { page: number; section?: string; title?: string };
type ElementMeta = { text?: string };

const slideMeta = slidesJson as SlideMeta[];
const elementMeta = elementsJson as Record<string, ElementMeta[]>;

/** 侧栏课程名。课件 section 为空时才用，不拿来代替每一页自己的章节。 */
const SIDEBAR_COURSE = "第六章";

const LEGACY_TITLE = /^第\s*(\d+)\s*页(?:图片)?$/;

function compact(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

/** 课件这一页所属章节 + 页码，例如「封面/导读 第 2 页」。对不上页就返回 null。 */
export function pageNoteTitle(page: number): string | null {
  const hit = slideMeta.find((s) => s.page === page);
  if (!hit) return null;
  const section = hit.section?.trim() || SIDEBAR_COURSE;
  return `${section} 第 ${page} 页`;
}

function pageFromNote(note: { title: string; text: string }): number | null {
  const fromTitle = note.title.trim().match(/第\s*(\d+)\s*页/);
  const fromBody = note.text.match(/第\s*(\d+)\s*页/);
  const raw = fromTitle?.[1] || fromBody?.[1];
  const page = raw ? Number(raw) : NaN;
  return Number.isFinite(page) && page > 0 ? page : null;
}

/** 旧标题「第 N 页」或「第 N 页图片」只在编辑器里显示成章节名 + 页码，不写回存储。 */
export function displayNoteTitle(note: { title: string; text: string }): string {
  if (!LEGACY_TITLE.test(note.title.trim())) return note.title;
  const page = pageFromNote(note);
  if (!page) return note.title;
  return pageNoteTitle(page) ?? note.title;
}

/** 收藏时自动写进正文的说明，不是用户笔记。 */
function isAutoNoteText(note: { kind?: string; title: string; text: string }): boolean {
  const text = compact(note.text);
  if (!text) return false;
  if (/^第\s*\d+\s*页\s*[·・]\s*第\s*\d+\s*页中的一张图$/.test(text)) return true;
  if (/^第\s*\d+\s*页课件$/.test(text)) return true;

  const prefixed = text.match(/^第\s*(\d+)\s*页\s*[·・]\s*(.+)$/);
  if (prefixed) {
    const rest = prefixed[2].trim();
    const boxes = elementMeta[prefixed[1]] ?? [];
    if (rest && boxes.some((b) => compact(b.text ?? "") === rest)) return true;
  }

  if ((note.kind === "page" || note.kind === "element") && LEGACY_TITLE.test(note.title.trim())) {
    const page = pageFromNote(note);
    const slide = page ? slideMeta.find((s) => s.page === page) : undefined;
    if (slide) {
      const candidates = [slide.title, slide.section, "本页要点"].map((s) => compact(s ?? "")).filter(Boolean);
      if (candidates.includes(text)) return true;
    }
  }
  return false;
}

/** 系统说明在编辑器里显示为空，用户改过的正文原样保留。 */
export function displayNoteText(note: { kind?: string; title: string; text: string }): string {
  return isAutoNoteText(note) ? "" : note.text;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function normalize(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return [];
  const out: Note[] = [];
  for (const item of raw) {
    const n = item as Partial<Note>;
    const text = String(n.text ?? "").trim();
    if (!text && !n.image) continue;
    out.push({
      id: n.id || uid(),
      kind: n.kind ?? "text",
      title: n.title || text.slice(0, 28) || "笔记",
      text,
      image: n.image,
      at: n.at || Date.now(),
    });
  }
  return out;
}

function load(): Note[] {
  if (typeof window === "undefined") return [];
  try {
    const next = localStorage.getItem(KEY);
    if (next) return normalize(JSON.parse(next));
    const old = localStorage.getItem("ch6-notes-v1");
    return old ? normalize(JSON.parse(old)) : [];
  } catch {
    return [];
  }
}

type Draft = { kind?: NoteKind; title?: string; text: string; image?: string };

const NotesCtx = createContext<{
  notes: Note[];
  add: (input: string | Draft) => void;
  update: (id: string, patch: Partial<Pick<Note, "title" | "text">>) => void;
  remove: (id: string) => void;
}>({ notes: [], add: () => {}, update: () => {}, remove: () => {} });

export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    setNotes(load());
  }, []);

  const write = useCallback((next: Note[]) => {
    setNotes(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // 图片太多时只留在这次会话
    }
  }, []);

  const add = useCallback(
    (input: string | Draft) => {
      const draft: Draft = typeof input === "string" ? { text: input, kind: "text" } : input;
      const text = draft.text.trim();
      if (!text && !draft.image) return;
      const note: Note = {
        id: uid(),
        kind: draft.kind ?? "text",
        title: (draft.title || text.slice(0, 28) || "笔记").trim(),
        text,
        image: draft.image,
        at: Date.now(),
      };
      write([note, ...load()].slice(0, 80));
    },
    [write],
  );

  const update = useCallback(
    (id: string, patch: Partial<Pick<Note, "title" | "text">>) => {
      write(
        load().map((n) =>
          n.id === id
            ? { ...n, ...patch, title: (patch.title ?? n.title).trim() || n.title, text: patch.text ?? n.text }
            : n,
        ),
      );
    },
    [write],
  );

  const remove = useCallback(
    (id: string) => {
      write(load().filter((n) => n.id !== id));
    },
    [write],
  );

  const value = useMemo(() => ({ notes, add, update, remove }), [notes, add, update, remove]);
  return <NotesCtx.Provider value={value}>{children}</NotesCtx.Provider>;
}

export function useNotes() {
  return useContext(NotesCtx);
}

/** 点开一条笔记：看全文、改文字 */
export function NoteEditor({
  note,
  onClose,
}: {
  note: Note | null;
  onClose: () => void;
}) {
  const { update } = useNotes();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    setTitle(note ? displayNoteTitle(note) : "");
    setText(note ? displayNoteText(note) : "");
  }, [note]);

  if (!note) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[86dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-paper-line px-4 py-3">
          <span className="text-[13px] font-medium">笔记</span>
          <button type="button" onClick={onClose} className="ml-auto text-[12px] text-ink-faint hover:text-ink">
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {note.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={note.image} alt="" className="w-full rounded-lg ring-1 ring-paper-line" />
          ) : null}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-paper-line bg-paper-soft px-3 py-2 text-[14px] outline-none"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="写下笔记"
            className="w-full resize-none rounded-lg border border-paper-line bg-paper-soft px-3 py-2 text-[13px] leading-6 outline-none"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-paper-line px-4 py-3">
          <button
            type="button"
            onClick={() => {
              update(note.id, { title, text });
              onClose();
            }}
            className="rounded-lg bg-ink px-3 py-1.5 text-[13px] text-paper"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

/** 模型把收藏汇总成一篇笔记，再打开打印窗口，让学生存成 PDF */
export async function exportNotePdf(notes: Note[]) {
  const res = await fetch("/api/digest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      notes: notes.map((n) => ({ title: n.title, kind: n.kind, text: n.text })),
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "汇总失败");
  const markdown = esc(String(json.markdown || ""))
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\n{2,}/g, "</p><p>");
  const imgs = notes
    .filter((n) => n.image)
    .map(
      (n) =>
        `<figure><img src="${n.image}" alt=""><figcaption>${esc(n.title)}</figcaption></figure>`,
    )
    .join("");
  const w = window.open("", "_blank");
  if (!w) throw new Error("浏览器拦住了导出窗口，请允许弹出窗口后再试");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>我的第六章笔记</title>
    <style>
      body{font-family:"Songti SC","PingFang SC",serif;max-width:720px;margin:32px auto;line-height:1.75;color:#1a1a18}
      img{max-width:100%} figcaption{font-size:12px;color:#666}
      h1{font-size:22px} h2{font-size:18px;margin-top:1.4em}
    </style></head><body>
    <h1>我的第六章笔记</h1><p>${markdown}</p>${imgs}
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`);
  w.document.close();
}
