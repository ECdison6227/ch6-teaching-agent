"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAiDrawer } from "@/components/AiDrawer";
import { displayNoteTitle, pageNoteTitle, useNotes } from "./notes";
import { KNOWLEDGE_SECTIONS } from "@/lib/sections";
import {
  StudyNotes,
  cleanBullets,
  cleanNoteLine,
  cleanTitle,
  type SlideNote,
} from "@/components/StudyNotes";
import { PracticePanel, pickQuestions, type Question } from "@/components/PracticePanel";
import { questionsByPage } from "@/lib/covered-questions";
import { SlideStage } from "@/components/SlideStage";
import { ReinforcementLab } from "@/components/ReinforcementLab";
import slidesData from "@/content/slides.json";
import questionsData from "@/content/questions.json";

type Slide = { page: number; section: string; title: string; bullets: string[]; image: string };

const slides = slidesData as Slide[];
const questions = questionsData as Question[];

const slideArrow =
  "absolute top-1/2 z-20 h-10 w-10 -translate-y-1/2 rounded-full bg-black/30 text-white shadow-sm hover:bg-black/45 hover:text-white disabled:opacity-25";

/** 第 37 页讲的是配筋率。Beta 打开时，它的下一页是可拖的截面，不是第 38 页。 */
const LAB_AFTER = 37;
const BETA_KEY = "ch6-study-beta";

export function StudyView() {
  const { ask, close, open, bindSlide } = useAiDrawer();
  const { notes: savedNotes, add: addNote } = useNotes();

  /** slide-notes.json 由脚本后台生成，可能不存在或只覆盖部分页 → 动态载入 + 兜底 */
  const [notes, setNotes] = useState<Record<string, SlideNote>>({});
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const mod = await import("@/content/slide-notes.json");
        const data = (mod as unknown as { default?: Record<string, SlideNote> }).default;
        if (alive && data && typeof data === "object") setNotes(data);
      } catch {
        /* 笔记文件还没生成时静默降级到 slides.json */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, Slide[]>();
    for (const s of slides) {
      const arr = map.get(s.section) ?? [];
      arr.push(s);
      map.set(s.section, arr);
    }
    return [...map.entries()]
      .map(([section, pages]) => ({ section, pages: [...pages].sort((a, b) => a.page - b.page) }))
      .sort((a, b) => a.pages[0].page - b.pages[0].page);
  }, []);

  const bookOnly = KNOWLEDGE_SECTIONS.filter((s) => s.only === "book");

  const [selSection, setSelSection] = useState<string>(groups[0]?.section ?? "");
  const [pageNo, setPageNo] = useState<number>(groups[0]?.pages[0]?.page ?? 1);
  const [bookSel, setBookSel] = useState<string | null>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [chapterGate, setChapterGate] = useState(false);
  const [beta, setBeta] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const notesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBeta(window.localStorage.getItem(BETA_KEY) === "1");
  }, []);

  const toggleBeta = () => {
    setBeta((on) => {
      const next = !on;
      window.localStorage.setItem(BETA_KEY, next ? "1" : "0");
      if (!next) setLabOpen(false);
      return next;
    });
  };

  /** 切章 / 翻页时把各栏的滚动位置拉回顶部（移动端整页共用一个滚动容器） */
  const shellRef = useRef<HTMLDivElement>(null);
  const scrollKey = chapterGate ? `${bookSel ?? selSection}#gate` : (bookSel ?? `${selSection}#${pageNo}`);
  useEffect(() => {
    shellRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  const group = groups.find((g) => g.section === selSection);
  const slide = group?.pages.find((p) => p.page === pageNo) ?? group?.pages[0];
  const idx = group ? group.pages.findIndex((p) => p.page === pageNo) : -1;
  const pageTitle = slide ? pageNoteTitle(slide.page) : null;
  const pageSaved =
    !!pageTitle && savedNotes.some((note) => note.kind === "page" && displayNoteTitle(note) === pageTitle);

  const goSection = (section: string) => {
    const g = groups.find((x) => x.section === section);
    setChapterGate(false);
    setLabOpen(false);
    setBookSel(null);
    setSelSection(section);
    if (g) setPageNo(g.pages[0].page);
  };

  const atLast = !bookSel && !!group && idx === group.pages.length - 1;
  const nextLabel = (() => {
    if (bookSel) {
      const i = bookOnly.findIndex((s) => s.id === bookSel);
      return bookOnly[i + 1] ? `${bookOnly[i + 1].id} ${bookOnly[i + 1].name}` : null;
    }
    const i = groups.findIndex((g) => g.section === selSection);
    if (groups[i + 1]) return groups[i + 1].section;
    if (bookOnly[0]) return `${bookOnly[0].id} ${bookOnly[0].name}`;
    return null;
  })();
  const goNextChapter = () => {
    setChapterGate(false);
    if (bookSel) {
      const i = bookOnly.findIndex((s) => s.id === bookSel);
      const n = bookOnly[i + 1];
      if (n) setBookSel(n.id);
      return;
    }
    const i = groups.findIndex((g) => g.section === selSection);
    if (groups[i + 1]) goSection(groups[i + 1].section);
    else if (bookOnly[0]) setBookSel(bookOnly[0].id);
    setChaptersOpen(false);
  };

  /** 本页要点：优先 AI 笔记，其次清洗后的 OCR 碎片 */
  const noteBlock = useMemo(() => {
    if (!slide) return { title: "本页要点", points: [] as string[], keys: [] as string[], source: "ocr" as const };
    const raw = notes[String(slide.page)];
    const points = (raw?.points ?? []).map(cleanNoteLine).filter(Boolean);
    if (points.length) {
      return {
        title: cleanTitle(raw?.title) || cleanTitle(slide.title) || slide.section || "本页要点",
        points,
        keys: (raw?.keys ?? []).filter((k) => typeof k === "string" && k.trim()),
        source: "ai" as const,
      };
    }
    return {
      title: cleanTitle(slide.title) || slide.section || "本页要点",
      points: cleanBullets(slide.bullets).slice(0, 8),
      keys: [] as string[],
      source: "ocr" as const,
    };
  }, [slide, notes]);

  /** 纯教材节仍按节名挑题。有课件的节改成「讲到这一页为止」才能做。 */
  const activeSection = bookSel
    ? `${bookSel} ${KNOWLEDGE_SECTIONS.find((s) => s.id === bookSel)?.name ?? ""}`
    : selSection;
  const bookQuestions = useMemo(
    () => (bookSel ? pickQuestions(questions, activeSection, 3) : []),
    [bookSel, activeSection],
  );
  const questionsOnPage = useMemo(() => {
    const covered = slides.map((s) => ({ ...s, note: notes[String(s.page)] }));
    return questionsByPage(questions, covered, 3);
  }, [notes]);
  const pageQuestions = slide && !bookSel ? (questionsOnPage.get(slide.page) ?? []) : [];

  const onLab = beta && labOpen && !bookSel && !chapterGate;
  const pageCtx = {
    page: onLab ? LAB_AFTER : (slide?.page ?? 0),
    section: activeSection,
    title: onLab ? "配筋率示意" : noteBlock.title,
    bullets: onLab ? ["拖动配筋率，看少筋、适筋、超筋"] : noteBlock.points.slice(0, 6),
    classmate: beta,
  };

  const discuss = () =>
    ask({
      question: "请老师先讲我正在看的这一页里最关键的一步，同学再用自己的话追问一个点。先不要出题。",
      context: pageCtx,
    });

  useEffect(() => {
    if (!notesOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!notesRef.current?.contains(e.target as Node)) setNotesOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [notesOpen]);

  useEffect(() => {
    setNotesOpen(false);
  }, [pageNo, bookSel]);

  useEffect(() => {
    if (!slide || bookSel) {
      bindSlide(null);
      return;
    }
    bindSlide({
      page: slide.page,
      src: `/slides/slide-${String(slide.page).padStart(3, "0")}.png`,
    });
  }, [slide, bookSel, bindSlide]);

  const askPage = () =>
    ask({
      question: `帮我讲讲第 ${slide?.page} 页的 ${noteBlock.title}`,
      context: pageCtx,
    });

  return (
    <div ref={shellRef} className="relative h-full min-h-0 overflow-y-auto">
      <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-paper-line bg-paper px-3 py-2">
        <SidebarTrigger />
        <button
          type="button"
          onClick={() => setChaptersOpen((v) => !v)}
          className="rounded-lg border border-paper-line px-2.5 py-1 text-[12.5px] text-ink-soft hover:bg-paper-soft"
        >
          {chaptersOpen ? "收起章节" : "章节"}
        </button>
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-faint">
          {bookSel ? activeSection : slide?.section}
        </span>
        <Button
          type="button"
          size="sm"
          variant={beta ? "default" : "outline"}
          aria-pressed={beta}
          onClick={toggleBeta}
        >
          Beta
        </Button>
        {beta ? (
          <Button type="button" size="sm" variant="outline" onClick={discuss}>
            同学
          </Button>
        ) : null}
        <button
          type="button"
          onClick={() => (open ? close() : ask({ context: pageCtx }))}
          className="shrink-0 rounded-lg border border-paper-line px-2.5 py-1 text-[12.5px] text-ink-soft hover:bg-paper-soft"
        >
          {open ? "收起" : "问 AI"}
        </button>
      </div>

      {chaptersOpen ? (
        <div className="absolute left-3 top-12 z-30 max-h-[70%] w-56 overflow-y-auto rounded-xl border border-paper-line bg-paper p-2 shadow-lg">
          {groups.map((g) => (
            <button
              key={g.section}
              type="button"
              onClick={() => {
                goSection(g.section);
                setChaptersOpen(false);
              }}
              className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[13px] ${
                g.section === selSection && !bookSel ? "bg-paper-soft text-ink" : "text-ink-soft hover:bg-paper-soft"
              }`}
            >
              {g.section}
            </button>
          ))}
          <div className="mt-2 px-2 text-[11px] text-ink-faint">仅教材</div>
          {bookOnly.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setChapterGate(false);
                setLabOpen(false);
                setBookSel(s.id);
                setChaptersOpen(false);
              }}
              className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[13px] ${
                bookSel === s.id ? "bg-paper-soft text-ink" : "text-ink-soft hover:bg-paper-soft"
              }`}
            >
              {s.id} {s.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex w-full flex-1 flex-col justify-center">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
        {chapterGate && nextLabel ? (
          <div className="relative flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-paper-line bg-paper">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="上一页"
              onClick={() => setChapterGate(false)}
              className={`${slideArrow} left-2`}
            >
              <ChevronLeft />
            </Button>
            <Button type="button" onClick={goNextChapter}>
              进入下一章 · {nextLabel}
            </Button>
          </div>
        ) : bookSel ? (
          <div className="relative rounded-2xl border border-paper-line bg-paper p-6">
            <div className="text-[13px] text-ink-faint">{activeSection}</div>
            <h2 className="mt-1 text-[18px] font-medium">本节没有授课 PPT</h2>
            <p className="mt-3 text-[13px] leading-7 text-ink-soft">下面的题对应这一节。看不懂可以问右边的老师。</p>
            {nextLabel ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="下一页"
                onClick={() => setChapterGate(true)}
                className={`${slideArrow} right-2`}
              >
                <ChevronRight />
              </Button>
            ) : null}
          </div>
        ) : slide ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-[12px] tabular-nums text-ink-faint">
                {onLab ? `第 ${LAB_AFTER} 页之后 · 配筋率示意` : `${idx + 1} / ${group?.pages.length} · 第 ${slide.page} 页`}
              </span>
              <button
                type="button"
                onClick={askPage}
                className="rounded-lg border border-paper-line px-2.5 py-1 text-[12px] text-ink-soft hover:bg-paper"
              >
                这页没看懂
              </button>
            </div>
            <div className="relative" ref={notesRef}>
              {onLab ? (
                <ReinforcementLab />
              ) : (
              <SlideStage page={slide.page} alt={noteBlock.title} />
              )}
              {onLab ? null : (
              <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={pageSaved ? "已收藏这一页" : "收藏这一页"}
                  aria-pressed={pageSaved}
                  title={pageSaved ? "已收藏这一页" : "收藏这一页"}
                  className={`h-7 w-7 bg-white/85 shadow-sm ${
                    pageSaved
                      ? "border-red-200 text-red-600 hover:bg-white/85 hover:text-red-600"
                      : "border-black/5 text-ink-faint hover:text-ink"
                  }`}
                  onClick={() => {
                    if (pageSaved || !pageTitle) return;
                    addNote({
                      kind: "page",
                      title: pageTitle,
                      text: "",
                      image: `/slides/slide-${String(slide.page).padStart(3, "0")}.png`,
                    });
                  }}
                >
                  <Bookmark className={pageSaved ? "fill-current" : undefined} />
                </Button>
                <button
                  type="button"
                  aria-label="本页要点"
                  onClick={() => setNotesOpen((v) => !v)}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-white/85 text-ink-faint shadow-sm ring-1 ring-black/5 hover:text-ink"
                >
                  <StickyNote className="h-3.5 w-3.5" />
                </button>
              </div>
              )}
              {notesOpen && !onLab ? (
                <div className="absolute right-2 top-12 z-20 max-h-72 w-72 overflow-y-auto rounded-xl border bg-card p-3 shadow-md">
                  <StudyNotes title={noteBlock.title} points={noteBlock.points} keys={noteBlock.keys} />
                </div>
              ) : null}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="上一页"
                disabled={idx <= 0 && !onLab}
                onClick={() => {
                  if (onLab) {
                    setLabOpen(false);
                    return;
                  }
                  if (beta && slide.page === LAB_AFTER + 1) {
                    setPageNo(LAB_AFTER);
                    setLabOpen(true);
                    return;
                  }
                  const prev = group?.pages[idx - 1];
                  if (prev) setPageNo(prev.page);
                }}
                className={`${slideArrow} left-2`}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="下一页"
                disabled={atLast && !nextLabel}
                onClick={() => {
                  if (!group) return;
                  if (onLab) {
                    setLabOpen(false);
                    setPageNo(LAB_AFTER + 1);
                    return;
                  }
                  if (beta && slide.page === LAB_AFTER) {
                    setNotesOpen(false);
                    setLabOpen(true);
                    return;
                  }
                  if (idx < group.pages.length - 1) {
                    const next = group.pages[idx + 1];
                    if (next) setPageNo(next.page);
                    return;
                  }
                  if (nextLabel) {
                    setNotesOpen(false);
                    setChapterGate(true);
                  }
                }}
                className={`${slideArrow} right-2`}
              >
                <ChevronRight />
              </Button>
            </div>
            {pageQuestions.length && !onLab ? (
              <div className="mt-4">
                <PracticePanel
                  key={`${selSection}#${slide.page}`}
                  questions={pageQuestions}
                  context={pageCtx}
                />
              </div>
            ) : null}
          </>
        ) : null}

        {bookSel && !chapterGate && bookQuestions.length ? (
          <div className="mt-8 border-t border-paper-line pt-5">
            <PracticePanel key={`book:${bookSel}`} questions={bookQuestions} context={pageCtx} />
          </div>
        ) : null}
      </div>
      </div>
      </div>
    </div>
  );
}
