"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { BookOpen, Calculator, Download, Ellipsis, Home, MessageSquare, NotebookPen, PencilLine, Radio, Search, SquareActivity } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSidebar } from "@/components/ui/sidebar";
import { openSearch } from "@/components/search/CommandSearch";
import type { AppView } from "@/lib/views";

const TABS: { id: AppView; label: string; icon: typeof BookOpen }[] = [
  { id: "slides", label: "课件", icon: BookOpen },
  { id: "chat", label: "助教", icon: MessageSquare },
  { id: "practice", label: "练习", icon: PencilLine },
  { id: "classroom", label: "课堂", icon: Radio },
];

const MORE: { id: AppView | "notes" | "search"; label: string; icon: typeof BookOpen }[] = [
  { id: "home", label: "课程主页", icon: Home },
  { id: "search", label: "搜索", icon: Search },
  { id: "lab", label: "配筋计算", icon: Calculator },
  { id: "demo", label: "受力演示", icon: SquareActivity },
  { id: "materials", label: "资料下载", icon: Download },
  { id: "notes", label: "笔记", icon: NotebookPen },
];

/** 手机端底部标签栏：常用的 4 个 + 更多。桌面端不渲染（CSS 隐藏）。 */
export function MobileTabBar({ view, onView }: { view: AppView; onView: (v: AppView) => void }) {
  const [more, setMore] = useState(false);
  const { setOpenMobile } = useSidebar();
  const moreActive = !TABS.some(t => t.id === view) && view !== "home";
  return (
    <>
      <nav className="mobile-tabbar" aria-label="主要功能">
        {TABS.map(t => {
          const active = view === t.id;
          return (
            <button key={t.id} type="button" aria-current={active ? "page" : undefined} onClick={() => onView(t.id)}>
              {active ? <motion.span layoutId="tab-active" className="mobile-tab-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} /> : null}
              <t.icon /><span>{t.label}</span>
            </button>
          );
        })}
        <button type="button" aria-current={moreActive ? "page" : undefined} onClick={() => setMore(true)}>
          {moreActive ? <motion.span layoutId="tab-active" className="mobile-tab-pill" /> : null}
          <Ellipsis /><span>更多</span>
        </button>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="mobile-more">
          <SheetTitle className="sr-only">更多</SheetTitle>
          <SheetDescription className="sr-only">更多功能</SheetDescription>
          <div className="mobile-more-grid">
            {MORE.map(m => (
              <button key={m.id} type="button" onClick={() => {
                setMore(false);
                if (m.id === "search") window.setTimeout(openSearch, 200);
                else if (m.id === "notes") window.setTimeout(() => setOpenMobile(true), 200);
                else onView(m.id);
              }}>
                <span className="mobile-more-icon"><m.icon /></span>{m.label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
