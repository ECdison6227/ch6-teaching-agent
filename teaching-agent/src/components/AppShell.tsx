"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import { useHydratedReducedMotion } from "@/hooks/use-hydrated-reduced-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { KNOWLEDGE_SECTIONS } from "@/lib/sections";
import { appPath } from "@/lib/app-path";
import { ChatView } from "./ChatView";
import { useChat } from "@/lib/useChat";
import { AiDrawerProvider, AiSidePanel, useAiDrawer } from "./AiDrawer";
import { NotesProvider } from "./notes";
import { MaterialsView } from "./MaterialsView";
import { Sidebar, type AppView } from "./Sidebar";
import { StudyView } from "./StudyView";
import { SelfTestView } from "./SelfTestView";
import { ClassroomView } from "./ClassroomView";
const LinkedPracticeView = dynamic(() => import("@/features/linked-practice/LinkedPracticeView"), { loading: () => <p className="kimi-quiet-state" role="status">正在读取关联练习…</p> });
const BeamDemoView = dynamic(() => import("@/features/beam-demo/BeamDemoView"), { loading: () => <p className="kimi-quiet-state" role="status">正在读取演示…</p> });

const SUGGESTIONS = [
  "帮我判断这个梁截面会不会超筋",
  "讲讲适筋梁受弯的三个受力阶段",
  "斜截面受剪有哪几种破坏形态",
];

function ChatPane() {
  const chat = useChat(null);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="kimi-toolbar">
        <SidebarTrigger /><span>引导对话</span><span className="ml-auto text-xs text-muted-foreground">第六章</span>
      </div>
      <div className="min-h-0 flex-1">
        <ChatView
          chat={chat}
          suggestions={SUGGESTIONS}
          welcome={
            <div className="kimi-chat-welcome">
              <p className="mb-3 text-xs tracking-wide text-muted-foreground">第六章 · 引导式学习</p>
              <h1>钢筋混凝土梁承载力计算原理</h1>
              <p className="text-sm leading-6 text-muted-foreground">先看资料，再做题。</p>
            </div>
          }
        />
      </div>
    </div>
  );
}

const PREVIEW_SECTION_COUNT = 3;

/** 自学天地 + 右侧 AI 面板：手机上面板打开时课件先让位，免得两边都被挤扁 */
function StudyPane() {
  const { open } = useAiDrawer();
  return (
    <>
      <div className={`min-h-0 min-w-0 flex-1 ${open ? "hidden md:block" : ""}`}>
        <StudyView />
      </div>
      <AiSidePanel />
    </>
  );
}

function Landing({ onEnter }: { onEnter: () => void }) {
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const visibleSections = sectionsOpen ? KNOWLEDGE_SECTIONS : KNOWLEDGE_SECTIONS.slice(0, PREVIEW_SECTION_COUNT);
  return <div className="h-full overflow-y-auto">
    <header className="kimi-toolbar"><SidebarTrigger /><span>课程概览</span><span className="ml-auto text-xs text-muted-foreground">第六章 · 东南大学</span></header>
    <main className="kimi-page">
      <header className="kimi-page-heading"><div><p>结构工程设计原理 · 第六章</p></div></header>
      <Card className="kimi-stage relative"><img src={appPath("/seu-logo.png")} alt="" aria-hidden="true" className="kimi-landing-watermark" /><div className="kimi-start-state relative z-10"><p className="kimi-eyebrow">钢筋混凝土结构</p><h2>钢筋混凝土梁承载力计算原理</h2><p>从受力现象到截面计算，一步步理解。</p><div className="kimi-actions mt-3"><Button className="kimi-primary" onClick={onEnter}>开始学习<ArrowRight /></Button></div><span className="mt-3 text-xs text-muted-foreground">148 页课件 · 14 个知识点 · 随学随记</span></div></Card>
      <ol className="divide-y divide-border/60">{visibleSections.map(section => <li key={section.id} className="flex items-baseline gap-4 py-4 text-sm"><span className="w-7 shrink-0 text-xs tabular-nums text-muted-foreground">{section.id}</span><span>{section.name}</span></li>)}</ol>
      <Button variant="ghost" className="mt-3 text-muted-foreground" aria-expanded={sectionsOpen} onClick={() => setSectionsOpen(open => !open)}>{sectionsOpen ? "收起目录" : "全部知识点"}{sectionsOpen ? <ChevronUp /> : <ChevronDown />}</Button>
    </main>
  </div>;
}


/** 各业务视图保留挂载和本地状态；课堂订阅仅在激活时运行。 */
export function AppShell() {
  const [view, setViewState] = useState<AppView>("home");
  const reduce = useHydratedReducedMotion();
  useEffect(() => {
    const sync = () => { const next = window.location.hash.slice(1); setViewState((["home", "chat", "study", "materials", "self-test", "classroom", "linked-practice", "reinforcement-demo"] as string[]).includes(next) ? next as AppView : "home"); };
    sync(); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync);
  }, []);
  const setView = (next: AppView) => { if (next !== view) window.history.pushState(null, "", next === "home" ? window.location.pathname + window.location.search : "#" + next); setViewState(next); };

  return (
    <MotionConfig reducedMotion="user"><NotesProvider>
      <AiDrawerProvider>
        <SidebarProvider>
          <Sidebar view={view} onView={setView} />
          <SidebarInset className="kimi-canvas flex min-h-0 flex-col bg-background">
            <div className="relative min-h-0 flex-1">
              <motion.div
                className="absolute inset-0"
                animate={{ opacity: view === "home" ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.15 }}
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
                transition={{ duration: reduce ? 0 : 0.15 }}
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
                transition={{ duration: reduce ? 0 : 0.15 }}
                style={{
                  pointerEvents: view === "study" ? "auto" : "none",
                  visibility: view === "study" ? "visible" : "hidden",
                }}
              >
                <StudyPane />
              </motion.div>
              <motion.div
                className="absolute inset-0 flex min-h-0 flex-col"
                animate={{ opacity: view === "materials" ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.15 }}
                style={{
                  pointerEvents: view === "materials" ? "auto" : "none",
                  visibility: view === "materials" ? "visible" : "hidden",
                }}
              >
                <MaterialsView />
              </motion.div>
              {(["self-test", "classroom"] as const).map(pane => (
                <motion.div
                  key={pane}
                  className="absolute inset-0 flex min-h-0 flex-col"
                  animate={{ opacity: view === pane ? 1 : 0 }}
                  transition={{ duration: reduce ? 0 : 0.15 }}
                  style={{ pointerEvents: view === pane ? "auto" : "none", visibility: view === pane ? "visible" : "hidden" }}
                >
                  <header className="kimi-toolbar"><SidebarTrigger /><span>{pane === "self-test" ? "题库自测" : "实时课堂"}</span></header>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {pane === "self-test" ? <SelfTestView /> : <ClassroomView active={view === "classroom"} />}
                  </div>
                </motion.div>
              ))}
              {view === "linked-practice" ? <motion.div className="absolute inset-0 flex min-h-0 flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.15 }}>
                <header className="kimi-toolbar"><SidebarTrigger /><span>关联练习</span></header>
                <div className="min-h-0 flex-1 overflow-y-auto"><LinkedPracticeView /></div>
              </motion.div> : null}
              {view === "reinforcement-demo" ? <motion.div className="absolute inset-0 flex min-h-0 flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.15 }}>
                <header className="kimi-toolbar"><SidebarTrigger /><span>单筋与双筋</span></header>
                <div className="min-h-0 flex-1 overflow-y-auto"><BeamDemoView /></div>
              </motion.div> : null}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </AiDrawerProvider>
    </NotesProvider></MotionConfig>
  );
}
