"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion } from "motion/react";
import { ChatView } from "./ChatView";
import { useChat, type PageCtx } from "@/lib/useChat";

type AskPayload = { question?: string; context?: PageCtx | null };

type AttachPayload = { text?: string; image?: string };

type SlideShot = { page: number; src: string };

type DrawerApi = {
  ask: (p?: AskPayload) => void;
  /** 打开侧栏，把选中文字放进输入框引用、图片放进待发送，不自动发出 */
  attach: (p: AttachPayload) => void;
  close: () => void;
  open: boolean;
  bindSlide: (slide: SlideShot | null) => void;
};

type PanelState = {
  chat: ReturnType<typeof useChat>;
  ctx: PageCtx | null;
  close: () => void;
};

const AiDrawerCtx = createContext<DrawerApi>({
  ask: () => {},
  attach: () => {},
  close: () => {},
  open: false,
  bindSlide: () => {},
});
const PanelCtx = createContext<PanelState | null>(null);

export function useAiDrawer() {
  return useContext(AiDrawerCtx);
}

async function urlToDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * 自学天地右上角「问 AI」。
 * 面板由 AiSidePanel 排在课件右侧，把 PPT 挤到左边，不盖住页面。
 */
export function AiDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<PageCtx | null>(null);
  const slideRef = useRef<SlideShot | null>(null);

  const chat = useChat(ctx);

  const bindSlide = useCallback((slide: SlideShot | null) => {
    slideRef.current = slide;
  }, []);

  const queueRef = useRef(chat.queueImages);
  queueRef.current = chat.queueImages;
  const sendRef = useRef(chat.send);
  sendRef.current = chat.send;
  const quoteRef = useRef(chat.setQuote);
  quoteRef.current = chat.setQuote;

  const ask = useCallback((p: AskPayload = {}) => {
    setCtx(p.context ?? null);
    setOpen(true);
    const slide = slideRef.current;
    const question = p.question?.trim() || "";
    void (async () => {
      const image = slide ? await urlToDataUrl(slide.src) : null;
      if (question) {
        await sendRef.current(question, image ? [image] : undefined);
        return;
      }
      if (image) queueRef.current([image]);
    })();
  }, []);

  const attach = useCallback((p: AttachPayload) => {
    setOpen(true);
    const text = p.text?.trim();
    if (text) quoteRef.current(text);
    if (p.image) queueRef.current([p.image]);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ ask, attach, close, open, bindSlide }),
    [ask, attach, close, open, bindSlide],
  );
  const panel = useMemo(() => ({ chat, ctx, close }), [chat, ctx, close]);

  return (
    <AiDrawerCtx.Provider value={value}>
      <PanelCtx.Provider value={panel}>
        {children}
      </PanelCtx.Provider>
    </AiDrawerCtx.Provider>
  );
}

/** 放进自学天地那一栏的右侧，和课件并排 */
export function AiSidePanel() {
  const { open } = useAiDrawer();
  const panel = useContext(PanelCtx);
  if (!open || !panel) return null;
  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 400, opacity: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="flex h-full shrink-0 flex-col overflow-hidden border-l bg-background"
    >
      <div className="min-h-0 w-[400px] flex-1">
        <ChatView chat={panel.chat} compact />
      </div>
    </motion.aside>
  );
}
