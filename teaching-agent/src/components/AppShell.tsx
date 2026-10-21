"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import { useHydratedReducedMotion } from "@/hooks/use-hydrated-reduced-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { KNOWLEDGE_SECTIONS } from "@/lib/sections";
import { ChatView } from "./ChatView";
import { useChat } from "@/lib/useChat";
import { AiDrawerProvider, AiSidePanel, useAiDrawer } from "./AiDrawer";
import { NotesProvider } from "./notes";
import { MaterialsView } from "./MaterialsView";
import { Sidebar, type AppView } from "./Sidebar";
import { StudyView } from "./StudyView";
import { appPath } from "@/lib/app-path";
import { SelfTestView } from "./SelfTestView";
import { ClassroomView } from "./ClassroomView";

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

function Landing({ onEnter, onStudy, onMaterials }: { onEnter: () => void; onStudy: () => void; onMaterials: () => void }) {
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const reduce = useHydratedReducedMotion();
  const visibleSections = sectionsOpen ? KNOWLEDGE_SECTIONS : KNOWLEDGE_SECTIONS.slice(0, PREVIEW_SECTION_COUNT);
  return (
    <div className="kimi-overview h-full overflow-y-auto">
      <header className="kimi-toolbar"><SidebarTrigger /><span>课程概览</span><span className="ml-auto text-xs text-muted-foreground">第六章 · 东南大学</span></header>
      <div className="kimi-overview-grid">
        <motion.section className="kimi-course-intro" initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.32, ease: [0.49, 0.45, 0.8, 1.18] }}>
          <img src={appPath("/seu-logo.png")} alt="东南大学" width={64} height={64} className="size-16 rounded-full object-contain" />
          <p className="mt-6 text-sm text-muted-foreground">土木工程 · 结构工程设计原理</p>
          <h1 className="mt-3 text-[30px] font-medium leading-[1.5] tracking-tight">钢筋混凝土梁承载力计算原理</h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-muted-foreground">从受力现象出发，理解公式，再一步步完成计算。课件、引导对话和练习，陪你把这一章学明白。</p>
          <div className="kimi-course-facts"><span>148 页课件</span><span>14 个知识点</span><span>随学随记</span></div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={onEnter} className="h-11 rounded-full px-6">进入学习<ArrowRight /></Button>
            <Button type="button" variant="outline" onClick={onStudy} className="h-11 rounded-full px-6">浏览课件</Button>
          </div>
          <Button type="button" variant="link" className="mt-5 h-auto justify-start px-0 text-sm text-muted-foreground" onClick={onMaterials}>需要离线学习？下载课程资料 <ArrowRight className="size-3.5" /></Button>
        </motion.section>
        <motion.aside className="space-y-4" initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.32, delay: reduce ? 0 : 0.045 }}>
          <Card className="knowledge-card">
            <div className="flex items-center gap-2 text-sm font-medium"><span className="kimi-source-icon" style={{ maskImage: `url(${appPath("/design/kimi-web/folder.svg")})` }} aria-hidden />本章学习路线</div>
            <p className="text-sm leading-6 text-muted-foreground">先理解受弯与受剪的破坏形态，再学习截面计算；受扭、挠度和裂缝宽度结合教材补充。</p>
          </Card>
          <Card className="knowledge-card">
            <div className="flex items-center justify-between text-sm font-medium"><span>知识目录</span><span className="text-xs font-normal text-muted-foreground">K1 — K14</span></div>
            <ol className="divide-y divide-border/60">
              {visibleSections.map(section => <li key={section.id} className="flex items-baseline gap-3 py-3 text-sm"><span className="w-7 shrink-0 text-xs tabular-nums text-muted-foreground">{section.id}</span><span>{section.name}</span></li>)}
            </ol>
            <Button type="button" variant="ghost" className="w-full text-muted-foreground" aria-expanded={sectionsOpen} onClick={() => setSectionsOpen(open => !open)}>{sectionsOpen ? "收起" : "展开全部"}{sectionsOpen ? <ChevronUp /> : <ChevronDown />}</Button>
          </Card>
        </motion.aside>
      </div>
      <p className="kimi-course-footer">理解每一个步骤，也保留自己的思考。</p>
    </div>
  );
}


/** 各业务视图保留挂载和本地状态；课堂订阅仅在激活时运行。 */
export function AppShell() {
  const [view, setViewState] = useState<AppView>("home");
  const reduce = useHydratedReducedMotion();
  useEffect(() => {
    const sync = () => { const next = window.location.hash.slice(1); setViewState((["home", "chat", "study", "materials", "self-test", "classroom"] as string[]).includes(next) ? next as AppView : "home"); };
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
                <Landing onEnter={() => setView("chat")} onStudy={() => setView("study")} onMaterials={() => setView("materials")} />
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
                  <div className="shrink-0 px-3 pt-2"><SidebarTrigger /></div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {pane === "self-test" ? <SelfTestView /> : <ClassroomView active={view === "classroom"} />}
                  </div>
                </motion.div>
              ))}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </AiDrawerProvider>
    </NotesProvider></MotionConfig>
  );
}
