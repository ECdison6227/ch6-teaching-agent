"use client";

import { useEffect, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { openSearch } from "@/components/search/CommandSearch";
import { ProgressSync } from "@/components/progress/ProgressSync";
import { useMastery } from "@/lib/progress/store";
import { NAV_GROUPS, VIEWS, type AppView } from "@/lib/views";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Sidebar as Side,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NoteEditor, exportNotePdf, useNotes, type Note } from "./notes";
import { appPath } from "@/lib/app-path";

export type { AppView } from "@/lib/views";

export function Sidebar({
  view,
  onView,
}: {
  view: AppView;
  onView: (v: AppView) => void;
}) {
  const { setOpenMobile } = useSidebar();
  const { notes, remove, storageError, retrySave } = useNotes();
  const [openNote, setOpenNote] = useState<Note | null>(null);
  const mastery = useMastery();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  /** 手机上的侧栏是抽屉，切换视图后要收起来，不然一直盖着内容 */
  const goView = (next: AppView) => {
    onView(next);
    setOpenMobile(false);
  };

  useEffect(() => {
    setOpenMobile(false);
  }, [view, setOpenMobile]);

  const exportPdf = () => {
    setExporting(true);
    setExportError(null);
    void exportNotePdf(notes)
      .catch((e: Error) => setExportError(e.message))
      .finally(() => setExporting(false));
  };

  return (
    <>
      <Side collapsible="offcanvas">
        <div className="flex min-h-0 w-full flex-1 flex-col pt-3">
        <SidebarHeader className="px-3">
          <button type="button" className="seu-brand" onClick={() => goView("home")} aria-label="课程主页" aria-current={view === "home" ? "page" : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appPath("/seu-badge.svg")} alt="" className="seu-brand-badge" />
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13.5px] font-semibold tracking-wide">工程结构设计原理</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">第六章 · 钢筋混凝土梁</span>
            </span>
          </button>
          <button type="button" className="sidebar-search" onClick={openSearch}>
            <Search className="size-4" /><span className="flex-1 text-left">搜索</span><kbd>⌘K</kbd>
          </button>
        </SidebarHeader>
        <SidebarContent className="pt-2">
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.id} className="py-0">
              <SidebarGroupLabel className="nav-group-label">{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {VIEWS.filter((v) => v.group === group.id).map((n) => {
                  const Icon = n.icon!;
                  const active = view === n.id;
                  return (
                    <SidebarMenuItem key={n.id} className="relative">
                      {active ? <motion.span layoutId="nav-active" className="nav-active-pill" transition={{ type: "spring", stiffness: 520, damping: 42 }} /> : null}
                      <SidebarMenuButton isActive={active} tooltip={n.label} onClick={() => goView(n.id)} className="relative z-[1]">
                        <Icon />
                        <span>{n.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
          <SidebarGroup className="min-h-0 flex-1 pt-2">
            <div className="flex w-full min-w-0 items-center gap-1">
              <SidebarGroupLabel className="nav-group-label w-auto shrink-0">笔记{notes.length ? <span className="ml-1.5 tabular-nums">{notes.length}</span> : null}</SidebarGroupLabel>
              {notes.length ? (
                <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 shrink-0 px-2 text-[11.5px] text-muted-foreground" disabled={exporting} onClick={exportPdf}>
                  {exporting ? "正在汇总…" : "导出 PDF"}
                </Button>
              ) : null}
            </div>
            {exportError ? <p className="px-2 text-[11px] leading-4 text-muted-foreground">{exportError}</p> : null}
            {storageError ? (
              <div role="alert" className="px-2 text-xs leading-5 text-destructive">
                {storageError}
                <Button type="button" variant="ghost" size="sm" onClick={retrySave}>重试保存</Button>
              </div>
            ) : null}
            {notes.length === 0 ? (
              <p className="px-2 text-[12px] leading-5 text-muted-foreground/80">收藏的内容会出现在这里</p>
            ) : (
              <ul className="space-y-0.5 overflow-y-auto">
                {notes.map((n) => (
                  <li key={n.id} className="group/note relative rounded-lg hover:bg-sidebar-accent">
                    <button type="button" onClick={() => setOpenNote(n)} className="block w-full px-2 py-1.5 pr-8 text-left">
                      <p className="truncate text-[12.5px]">{n.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-[11.5px] leading-5 text-muted-foreground">{n.text}</p>
                    </button>
                    <button type="button" aria-label="删除笔记" onClick={() => remove(n.id)} className="absolute right-1.5 top-2 hidden rounded-md p-1 text-muted-foreground hover:bg-background hover:text-destructive group-hover/note:block">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SidebarGroup>
        </SidebarContent>
        <div className="seu-sidebar-foot">
          <ProgressSync>
            <button type="button" className="sidebar-progress" aria-label="学习进度与同步">
              <span className="flex items-baseline justify-between"><span>掌握 <b>{mastery.mastered}</b>/14</span><span className="text-[11px]">已看 {mastery.pagesViewed} 页</span></span>
              <span className="sidebar-progress-track"><motion.span initial={false} animate={{ scaleX: mastery.mastered / 14 }} transition={{ type: "spring", stiffness: 120, damping: 20 }} /></span>
              <span className="sidebar-progress-sync">同步到其他设备</span>
            </button>
          </ProgressSync>
          <span className="font-serif-cn mt-3 block text-center tracking-[0.5em]">止于至善</span>
        </div>
        </div>
      </Side>
      <NoteEditor note={openNote} onClose={() => setOpenNote(null)} />
    </>
  );
}
