"use client";

import { useEffect, useState } from "react";
import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, MessageSquarePlus, StickyNote, Trash2 } from "lucide-react";
import { NAV_GROUPS, VIEWS, type AppView } from "@/lib/views";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import type { Card as AnswerCardData } from "@/lib/cards";
import { AnswerCard } from "./AnswerCard";
import { NoteEditor, exportNotePdf, useNotes, type Note } from "./notes";
import { appPath } from "@/lib/app-path";

/** 第 2 页课件上真实的文字框（slide-elements p2-2），用来示意点选后的亮框 */
const PICK_BOX = { x: 0.05, y: 0.1, w: 0.925, h: 0.6896 };

const DEMO_CARDS: AnswerCardData[] = [
  {
    kind: "choice",
    prompt: "适筋梁破坏时，先到达极限的是哪一个？",
    options: [
      { id: "A", text: "受拉钢筋" },
      { id: "B", text: "受压区混凝土" },
    ],
    hint: "先想谁先屈服。",
    topic: "示例",
  },
  {
    kind: "truefalse",
    prompt: "超筋梁破坏前有明显预兆。",
    topic: "示例",
  },
  {
    kind: "data",
    prompt: "算这根梁还缺这两个数。",
    fields: [
      { key: "b", label: "截面宽度", unit: "mm", placeholder: "例如 250" },
      { key: "h", label: "截面高度", unit: "mm", placeholder: "例如 500" },
    ],
    topic: "示例",
  },
  {
    kind: "calc",
    prompt: "这一步把相对受压区高度填上。",
    fields: [{ key: "xi", label: "ξ", placeholder: "填这一步的结果" }],
    topic: "示例",
  },
];

type HelpId = "slides" | "points" | "pick" | "save" | "ask" | "practice" | "model" | "notes";

const HELP: { id: HelpId; title: string }[] = [
  { id: "slides", title: "看课件" },
  { id: "points", title: "本页要点" },
  { id: "pick", title: "点选文字或图片" },
  { id: "save", title: "收藏这一页" },
  { id: "ask", title: "问 AI" },
  { id: "practice", title: "做练习" },
  { id: "model", title: "模型与思考深度" },
  { id: "notes", title: "笔记" },
];

function PickShot({ compact }: { compact?: boolean }) {
  return (
    <div className={compact ? "relative w-24 shrink-0 overflow-hidden rounded-md border border-paper-line" : "relative overflow-hidden rounded-xl border border-paper-line"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={appPath("/slides/slide-002.png")} alt="课件上亮着的选框" className="block w-full" />
      <div
        className="pointer-events-none absolute rounded-sm border border-neutral-900 bg-black/[0.03] shadow-[0_0_0_3px_rgba(17,17,17,0.14)]"
        style={{
          left: `${PICK_BOX.x * 100}%`,
          top: `${PICK_BOX.y * 100}%`,
          width: `${PICK_BOX.w * 100}%`,
          height: `${PICK_BOX.h * 100}%`,
        }}
      />
    </div>
  );
}

function HelpVisual({ id }: { id: HelpId }) {
  if (id === "slides") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30">
          <ChevronLeft className="h-4 w-4" />
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30">
          <ChevronRight className="h-4 w-4" />
        </span>
      </span>
    );
  }
  if (id === "points") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/85 text-ink-faint shadow-sm ring-1 ring-black/5">
        <StickyNote className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (id === "pick") return <PickShot compact />;
  if (id === "save") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-black/5 bg-white/85 text-ink-faint shadow-sm">
        <Bookmark className="size-4" />
      </span>
    );
  }
  if (id === "ask") {
    return (
      <span className="shrink-0 rounded-lg border border-paper-line px-2.5 py-1 text-[12.5px] text-ink-soft">问 AI</span>
    );
  }
  if (id === "practice") {
    return <span className="shrink-0 rounded-lg bg-ink px-3.5 py-1.5 text-[12px] text-paper">提交</span>;
  }
  if (id === "model") {
    return (
      <span className="inline-flex h-8 w-[6.75rem] shrink-0 items-center justify-between rounded-md border border-input bg-transparent px-2 text-[12px]">
        模型
        <ChevronDown className="h-4 w-4 opacity-50" />
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-lg border border-paper-line bg-paper text-[12px] text-ink-soft">
      <span className="px-2.5 py-1">追问</span>
      <span className="border-l border-paper-line px-2.5 py-1">收藏到笔记</span>
    </span>
  );
}

function HelpDetail({ id }: { id: HelpId }) {
  if (id === "slides") {
    return (
      <p>
        点侧栏「课件」。顶栏左侧是当前知识点，点开可以切换。课件两侧的圆箭头翻页，本节最后一页再往后，进入下一节。
      </p>
    );
  }
  if (id === "points") {
    return (
      <p>
        点课件图右上角、书签右边这个便签，列出这一页的标题和要点。再点一次，或者点外面，就收起。换页也会收起。
      </p>
    );
  }
  if (id === "pick") {
    return (
      <div className="space-y-3">
        <PickShot />
        <p>在课件上点一段字或一张图，出现这样的亮框，以及这两个按钮。整页背景点不中。</p>
        <div className="flex flex-wrap gap-1">
          <span className="inline-flex h-8 items-center gap-2 rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground shadow-sm">
            <MessageSquarePlus className="size-4" />
            加入对话
          </span>
          <span className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow">
            <Bookmark className="size-4" />
            直接收藏
          </span>
        </div>
        <p>「加入对话」打开右边的问 AI。文字挂在输入框上，标成「追问」；图片排在输入框上方。不会自动发出。</p>
        <p>「直接收藏」马上出现在侧栏笔记里。</p>
      </div>
    );
  }
  if (id === "save") {
    return <p>课件图右上角这个书签，在便签左边。笔记里多一条，标题是「章节名 第 x 页」，点开能看到这一整页。</p>;
  }
  if (id === "ask") {
    return (
      <div className="space-y-2">
        <p>
          课件顶栏右侧「问 AI」，右边滑出对话，和课件并排。当前这一页会自动带上，写完再发送。
        </p>
                <p>老师有时会甩出下面这几种必答卡。还有没答的卡时，输入框会锁住。</p>
        {DEMO_CARDS.map((card) => (
          <AnswerCard key={card.kind} card={card} onSubmit={() => {}} />
        ))}
      </div>
    );
  }
  if (id === "practice") {
    return (
      <p>
        这一页有题时，练习直接出现在课件下面。选择题点选项，判断和填空写上答案，再点「提交」，会显示「答对了」或「答错了」。也可以先点「不会做，直接看答案」。答错之后可以「查看答案」「再做一次」「收藏这道题」，答案下面有「还是不懂，问 AI」。没有标准答案时，按钮是「暂无标准答案，问 AI」。这一页没有题，下面就不出现练习。只有教材、没有课件的节，有题时同样出现在下面。
      </p>
    );
  }
  if (id === "model") {
    return <p>输入框左下角的设置里可以换模型、调整思考深度。</p>;
  }
  return (
    <p>
      在「AI 助教」里选中一句话，出现「追问」和「收藏到笔记」。到侧栏点开这条笔记，改完文字再点「保存」。有笔记时，点「笔记」右边的「导出 PDF」，会整理成一篇并打开打印窗口。
    </p>
  );
}

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
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpId, setHelpId] = useState<HelpId | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const help = HELP.find((item) => item.id === helpId) ?? null;

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
          <span className="font-serif-cn tracking-[0.3em]">止于至善</span>
          <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setHelpOpen(true)}>
            <CircleHelp className="size-3.5" />用法
          </button>
        </div>
        </div>
      </Side>
      <Sheet
        open={helpOpen}
        onOpenChange={(open) => {
          setHelpOpen(open);
          if (!open) setHelpId(null);
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
          onPointerDownOutside={(event) => {
            if (helpId) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (helpId) event.preventDefault();
          }}
        >
          <SheetHeader className="shrink-0 space-y-1 px-5 pb-2 pr-12 pt-5 text-left">
            <SheetTitle>怎么用</SheetTitle>
            <SheetDescription className="sr-only">用法说明</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-6">
            {HELP.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.04 }}
              >
                <button type="button" onClick={() => setHelpId(item.id)} className="block w-full text-left">
                  <Card className="shadow-sm transition-colors hover:bg-accent/40">
                    <div className="grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 p-3">
                      <div className="flex min-w-0 items-center justify-center">
                        <HelpVisual id={item.id} />
                      </div>
                      <span className="text-sm font-medium">{item.title}</span>
                    </div>
                  </Card>
                </button>
              </motion.div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={help !== null} onOpenChange={(open) => { if (!open) setHelpId(null); }}>
        <DialogContent className={`flex max-h-[85vh] flex-col overflow-hidden ${helpId === "ask" ? "sm:max-w-xl" : ""}`}>
          {help ? (
            <>
              <DialogHeader className="shrink-0 pr-6">
                <DialogTitle>{help.title}</DialogTitle>
                <DialogDescription className="sr-only">{help.title}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto text-[13px] leading-6 text-foreground">
                <HelpDetail id={help.id} />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <NoteEditor note={openNote} onClose={() => setOpenNote(null)} />
    </>
  );
}
