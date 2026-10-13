"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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

/** 引导对话、自学天地、资料下载留在同一页里切换，避免路由跳转把对话清掉 */
export function AppShell() {
  const [view, setView] = useState<AppView>("chat");

  return (
    <NotesProvider>
      <AiDrawerProvider>
        <SidebarProvider>
          <Sidebar view={view} onView={setView} />
          <SidebarInset className="flex h-svh min-h-0 flex-col bg-background">
            <div className="relative min-h-0 flex-1">
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
