"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { KNOWLEDGE_SECTIONS } from "@/lib/sections";
import { ChatView } from "./ChatView";
import { useChat } from "@/lib/useChat";
import { AiDrawerProvider, AiSidePanel } from "./AiDrawer";
import { NotesProvider } from "./notes";
import { MaterialsView } from "./MaterialsView";
import { Sidebar, type AppView } from "./Sidebar";
import { StudyView } from "./StudyView";

const SUGGESTIONS = [
  "帮我判断这个梁截面会不会超筋",
  "讲讲适筋梁受弯的三个受力阶段",
  "斜截面受剪有哪几种破坏形态",
];

function ChatPane() {
  const chat = useChat(null);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center px-3 pt-2">
        <SidebarTrigger />
      </div>
      <div className="min-h-0 flex-1">
        <ChatView
          chat={chat}
          welcome={
            <div className="py-16 text-center">
              <h1 className="text-[20px] font-medium leading-8">钢筋混凝土梁承载力计算原理</h1>
              <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-muted-foreground">先看资料，再做题。</p>
              <div className="mt-7 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void chat.send(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}

const PREVIEW_SECTION_COUNT = 3;

function Landing({ onEnter }: { onEnter: () => void }) {
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const visibleSections = sectionsOpen ? KNOWLEDGE_SECTIONS : KNOWLEDGE_SECTIONS.slice(0, PREVIEW_SECTION_COUNT);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-md flex-col items-center px-6 pb-16 pt-14">
        <motion.div
          className="flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          <img
            src="/seu-logo.png"
            alt="东南大学"
            width={72}
            height={72}
            style={{ width: 72, height: 72, minWidth: 72, minHeight: 72, flexShrink: 0 }}
            className="size-[72px] shrink-0 rounded-full object-contain"
          />
          <p className="mt-5 text-sm tracking-wide text-muted-foreground">东南大学</p>
          <h1 className="mt-6 text-[22px] font-medium leading-8 tracking-tight">钢筋混凝土梁承载力计算原理</h1>
          <p className="mt-2 text-sm text-muted-foreground">第六章辅导</p>
        </motion.div>
        <motion.div
          className="mt-10 w-full space-y-3"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.06 }}
        >
          <Card className="shadow-none">
            <p className="px-5 py-4 text-sm leading-6 text-muted-foreground">
              讲梁的承载力怎么算，以及公式从哪来。正截面受弯从构造要求和破坏形态，到单筋、双筋矩形截面和 T 形截面；斜截面受剪讲到承载力计算。受扭、挠度和裂缝宽度来自教材。
            </p>
          </Card>
          <Card className="shadow-none">
            <ol className="px-5 py-2">
              {visibleSections.map((section) => (
                <li key={section.id} className="flex items-baseline gap-3 border-b border-border/70 py-2.5 text-sm last:border-0">
                  <span className="w-8 shrink-0 text-xs tabular-nums text-muted-foreground">{section.id}</span>
                  <span>{section.name}</span>
                </li>
              ))}
            </ol>
            <div className="px-3 pb-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                aria-expanded={sectionsOpen}
                onClick={() => setSectionsOpen((open) => !open)}
              >
                {sectionsOpen ? "收起" : "展开全部"}
                {sectionsOpen ? <ChevronUp /> : <ChevronDown />}
              </Button>
            </div>
          </Card>
        </motion.div>
        <Button type="button" className="mt-10" onClick={onEnter}>
          进入学习
        </Button>
      </div>
    </div>
  );
}

/** 引导对话、自学天地、资料下载留在同一页里切换，避免路由跳转把对话清掉 */
export function AppShell() {
  const [view, setView] = useState<AppView>("home");

  return (
    <NotesProvider>
      <AiDrawerProvider>
        <SidebarProvider>
          {view === "home" ? null : <Sidebar view={view} onView={setView} />}
          <SidebarInset className="flex h-svh min-h-0 flex-col bg-background">
            <div className="relative min-h-0 flex-1">
              <motion.div
                className="absolute inset-0"
                animate={{ opacity: view === "home" ? 1 : 0 }}
                transition={{ duration: 0.18 }}
                style={{
                  pointerEvents: view === "home" ? "auto" : "none",
                  visibility: view === "home" ? "visible" : "hidden",
                }}
              >
                <Landing onEnter={() => setView("chat")} />
              </motion.div>
              <motion.div
                className="absolute inset-0 flex flex-col"
                animate={{ opacity: view === "chat" ? 1 : 0 }}
                transition={{ duration: 0.18 }}
                style={{
                  pointerEvents: view === "chat" ? "auto" : "none",
                  visibility: view === "chat" ? "visible" : "hidden",
                }}
              >
                <ChatPane />
              </motion.div>
              <motion.div
                className="absolute inset-0 flex min-h-0"
                animate={{ opacity: view === "study" ? 1 : 0 }}
                transition={{ duration: 0.18 }}
                style={{
                  pointerEvents: view === "study" ? "auto" : "none",
                  visibility: view === "study" ? "visible" : "hidden",
                }}
              >
                <div className="min-h-0 min-w-0 flex-1">
                  <StudyView />
                </div>
                <AiSidePanel />
              </motion.div>
              <motion.div
                className="absolute inset-0 flex min-h-0 flex-col"
                animate={{ opacity: view === "materials" ? 1 : 0 }}
                transition={{ duration: 0.18 }}
                style={{
                  pointerEvents: view === "materials" ? "auto" : "none",
                  visibility: view === "materials" ? "visible" : "hidden",
                }}
              >
                <MaterialsView />
              </motion.div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </AiDrawerProvider>
    </NotesProvider>
  );
}
