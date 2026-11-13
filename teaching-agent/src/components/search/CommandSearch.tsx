"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, FileText, PencilLine, Sparkles } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { VIEWS, type AppView } from "@/lib/views";
import { requestStudySection } from "@/lib/study-nav";
import { requestPractice } from "@/lib/practice-nav";
import type { SearchItem } from "@/lib/search-index";

export const SEARCH_OPEN_EVENT = "ch6:search-open";
export const openSearch = () => window.dispatchEvent(new Event(SEARCH_OPEN_EVENT));

const pad = (k: string) => `K${k.slice(1).padStart(2, "0")}`;

/** ⌘K / Ctrl+K / “/” 打开；知识点、课件页、题目、功能入口一处搜到。 */
export function CommandSearch({ onView }: { onView: (view: AppView) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchItem[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); setOpen(v => !v); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(SEARCH_OPEN_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(SEARCH_OPEN_EVENT, onOpen); };
  }, []);

  useEffect(() => {
    if (open && !index) void import("@/lib/search-index").then(m => setIndex(m.buildSearchIndex()));
    if (!open) setQuery("");
  }, [open, index]);

  const groups = useMemo(() => {
    const all = index ?? [];
    const q = query.trim();
    // 没输入时只给知识点和功能入口，输入后再展开课件页和题目，避免一屏几百条
    return {
      k: all.filter(i => i.kind === "k"),
      slide: q ? all.filter(i => i.kind === "slide") : [],
      question: q ? all.filter(i => i.kind === "question") : [],
    };
  }, [index, query]);

  const go = (fn: () => void) => { setOpen(false); fn(); };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="搜索知识点、课件、题目或功能…" value={query} onValueChange={setQuery} />
      <CommandList className="search-list">
        <CommandEmpty>{index ? "没有找到相关内容" : "正在建立索引…"}</CommandEmpty>
        <CommandGroup heading="知识点">
          {groups.k.map(i => (
            <CommandItem key={i.id} value={`${i.id} ${pad(i.k)} ${i.title}`} onSelect={() => go(() => { requestStudySection(i.k); onView("slides"); })}>
              <span className="search-code">{pad(i.k)}</span><span className="truncate">{i.title}</span><span className="search-meta">{i.sub}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {groups.slide.length ? <><CommandSeparator /><CommandGroup heading="课件">
          {groups.slide.map(i => i.kind === "slide" && (
            <CommandItem key={i.id} value={`P${i.page} ${i.title} ${i.sub}`} onSelect={() => go(() => { requestStudySection(i.k, i.page); onView("slides"); })}>
              <BookOpen /><span className="min-w-0 flex-1"><span className="block truncate">{i.title}</span><span className="search-sub">{i.sub}</span></span><span className="search-meta">P.{String(i.page).padStart(3, "0")}</span>
            </CommandItem>
          ))}
        </CommandGroup></> : null}
        {groups.question.length ? <><CommandSeparator /><CommandGroup heading="题目">
          {groups.question.map(i => (
            <CommandItem key={i.id} value={`${i.id} ${i.title} ${i.sub}`} onSelect={() => go(() => { onView("practice"); window.setTimeout(() => requestPractice([i.id]), 50); })}>
              <PencilLine /><span className="min-w-0 flex-1 truncate">{i.title}</span>{i.k ? <span className="search-meta">{pad(i.k)}</span> : null}
            </CommandItem>
          ))}
        </CommandGroup></> : null}
        <CommandSeparator />
        <CommandGroup heading="功能">
          {VIEWS.map(v => {
            const Icon = v.icon ?? Sparkles;
            return <CommandItem key={v.id} value={`功能 ${v.label} ${v.path}`} onSelect={() => go(() => onView(v.id))}><Icon /><span>{v.label}</span></CommandItem>;
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
