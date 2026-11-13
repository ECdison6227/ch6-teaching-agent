"use client";

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { useHydratedReducedMotion } from "@/hooks/use-hydrated-reduced-motion";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { LEGACY_HASH, pathOf, viewFromPath, type AppView } from "@/lib/views";
import { ChatView } from "./ChatView";
import { useChat } from "@/lib/useChat";
import { AiDrawerProvider, AiSidePanel, useAiDrawer } from "./AiDrawer";
import { NotesProvider } from "./notes";
import { MaterialsView } from "./MaterialsView";
import { Sidebar } from "./Sidebar";
import { StudyView } from "./StudyView";
import { SelfTestView } from "./SelfTestView";
import { ClassroomView } from "./ClassroomView";
import { StudentClassroom } from "./StudentClassroom";
import { CourseHome } from "./home/CourseHome";

const Loading = ({ label }: { label: string }) => <p className="kimi-quiet-state" role="status">{label}</p>;
const BeamDemoView = dynamic(() => import("@/features/beam-demo/BeamDemoView"), { loading: () => <Loading label="正在载入演示…" /> });
const BeamLabView = dynamic(() => import("./BeamLabView").then(module => module.BeamLabView), { loading: () => <Loading label="正在载入配筋计算…" /> });

const SUGGESTIONS = [
  "帮我判断这个梁截面会不会超筋",
  "讲讲适筋梁受弯的三个受力阶段",
  "斜截面受剪有哪几种破坏形态",
];

/** 每个工作视图顶上的同一条工具栏：侧栏开关 + 视图名，右侧可放操作。 */
export function PaneHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="kimi-toolbar">
      <SidebarTrigger />
      <span className="pane-title">{title}</span>
      {children ? <div className="ml-auto flex items-center gap-1">{children}</div> : null}
    </header>
  );
}

function ChatPane() {
  const chat = useChat(null);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeader title="AI 助教" />
      <div className="min-h-0 flex-1">
        <ChatView
          chat={chat}
          suggestions={SUGGESTIONS}
          welcome={
            <div className="kimi-chat-welcome">
              <p className="mono-kicker">AI 助教 · 第六章</p>
              <h1 className="font-serif-cn">从一个问题开始</h1>
            </div>
          }
        />
      </div>
    </div>
  );
}

/** 课件 + 右侧 AI 面板：手机上面板打开时课件先让位，免得两边都被挤扁 */
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

/** 课堂：学生入口是主体；教师控制台收在页面底部。 */
function ClassroomPane({ active }: { active: boolean }) {
  const [teacher, setTeacher] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeader title={teacher ? "课堂 · 教师" : "课堂"} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {teacher ? <ClassroomView active={active} /> : <StudentClassroom embedded />}
        <div className="pb-10 text-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setTeacher(v => !v)}>
            {teacher ? "返回学生入口" : "我是教师"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 常驻挂载的视图层：切走时只是隐藏，回来时状态还在。 */
function Pane({ id, view, reduce, className = "flex flex-col", children }: { id: AppView; view: AppView; reduce: boolean; className?: string; children: ReactNode }) {
  const active = view === id;
  return (
    <motion.div
      className={`absolute inset-0 min-h-0 ${className}`}
      initial={false}
      animate={{ opacity: active ? 1 : 0, y: active || reduce ? 0 : 6 }}
      transition={{ duration: reduce ? 0 : active ? 0.28 : 0.12, ease: [0.22, 1, 0.36, 1] }}
      style={{ pointerEvents: active ? "auto" : "none", visibility: active ? "visible" : "hidden", zIndex: active ? 1 : 0 }}
      aria-hidden={!active}
    >
      {children}
    </motion.div>
  );
}

export function AppShell() {
  const pathname = usePathname();
  const router = useRouter();
  const view = viewFromPath(pathname);
  const reduce = useHydratedReducedMotion();
  const [visited, setVisited] = useState<Set<AppView>>(() => new Set([view]));
  useEffect(() => { setVisited(prev => (prev.has(view) ? prev : new Set(prev).add(view))); }, [view]);

  /** 旧版 /#beam-lab 一类地址：换成新路径 */
  useEffect(() => {
    const legacy = LEGACY_HASH[window.location.hash.slice(1)];
    if (legacy) router.replace(legacy);
  }, [router]);

  const go = (next: AppView) => { if (next !== view) router.push(pathOf(next)); };
  const lazy = (id: AppView) => visited.has(id) || view === id;

  return (
    <MotionConfig reducedMotion="user"><NotesProvider>
      <AiDrawerProvider>
        <SidebarProvider>
          <Sidebar view={view} onView={go} />
          <SidebarInset className="kimi-canvas flex min-h-0 flex-col bg-background">
            <div className="relative min-h-0 flex-1">
              <Pane id="home" view={view} reduce={reduce} className="">
                <CourseHome active={view === "home"} onView={go} />
              </Pane>
              <Pane id="chat" view={view} reduce={reduce}><ChatPane /></Pane>
              <Pane id="slides" view={view} reduce={reduce} className="flex"><StudyPane /></Pane>
              <Pane id="practice" view={view} reduce={reduce}>
                <PaneHeader title="练习" />
                <div className="min-h-0 flex-1 overflow-y-auto"><SelfTestView /></div>
              </Pane>
              <Pane id="classroom" view={view} reduce={reduce}><ClassroomPane active={view === "classroom"} /></Pane>
              <Pane id="materials" view={view} reduce={reduce}><MaterialsView /></Pane>
              {lazy("demo") ? (
                <Pane id="demo" view={view} reduce={reduce}>
                  <PaneHeader title="受力演示" />
                  <div className="min-h-0 flex-1 overflow-y-auto"><BeamDemoView /></div>
                </Pane>
              ) : null}
              {lazy("lab") ? (
                <Pane id="lab" view={view} reduce={reduce}>
                  <PaneHeader title="配筋计算" />
                  <div className="flex min-h-0 flex-1"><BeamLabView active={view === "lab"} /></div>
                </Pane>
              ) : null}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </AiDrawerProvider>
    </NotesProvider></MotionConfig>
  );
}
