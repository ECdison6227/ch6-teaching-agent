"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatAnswer, type Card, type CardAnswer, type Figure } from "@/lib/cards";
import type { ChatModelOption } from "@/lib/models/options";

export type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  card?: Card;
  answered?: boolean;
  verdict?: { correct: boolean; reason?: string };
  figures?: Figure[];
  /** 学生上传的原图（data URL），会随这条消息一起交给多模态模型 */
  images?: string[];
};

export type PageCtx = {
  page: number;
  section?: string;
  title?: string;
  bullets?: string[];
  classmate?: boolean;
};

const uid = () => Math.random().toString(36).slice(2, 10);

/** 引导对话的核心状态机：首页与侧边栏共用 */
export function useChat(context?: PageCtx | null) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 待随下一条消息一起发出的原图 */
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  /** 课件选区或回答里「追问」带进输入框的原文，发出后清空 */
  const [quote, setQuote] = useState<string | null>(null);
  /** 当前这套对话接下来要用的模型。首页和侧栏各有一套 useChat，所以各自记住。 */
  const [models, setModels] = useState<ChatModelOption[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);

  const msgsRef = useRef<Msg[]>([]);
  const ctxRef = useRef<PageCtx | null>(context ?? null);
  const modelRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((r) => {
        if (!r.ok) throw new Error("models");
        return r.json() as Promise<{ models?: ChatModelOption[]; defaultId?: string }>;
      })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data.models) ? data.models : [];
        setModels(list);
        const current = modelRef.current;
        const keep = current && list.some((m) => m.id === current) ? current : null;
        const next = keep || data.defaultId || list[0]?.id || null;
        modelRef.current = next;
        setModelId(next);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setModel = useCallback((id: string) => {
    modelRef.current = id;
    setModelId(id);
  }, []);

  useEffect(() => {
    ctxRef.current = context ?? null;
  }, [context]);

  const commit = useCallback((updater: (prev: Msg[]) => Msg[]) => {
    const next = updater(msgsRef.current);
    msgsRef.current = next;
    setMsgs(next);
    return next;
  }, []);

  /** 助手消息要带上自己发出的卡片，否则模型看不到上一轮问了什么 */
  const toHistory = (list: Msg[]) =>
    list
      .filter((m) => m.role === "user" || m.content.trim() || m.card || m.images?.length)
      .map((m) => {
        const text =
          m.role === "assistant" && m.card
            ? `${m.content}\n\n[我上一轮给出的卡片] ${JSON.stringify(m.card)}`
            : m.content;
        if (m.role === "user" && m.images?.length) {
          return {
            role: m.role,
            content: [
              { type: "text" as const, text: text.trim() || "请看我上传的图片" },
              ...m.images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
            ],
          };
        }
        return { role: m.role, content: text };
      });

  const handleEvent = useCallback(
    (ev: Record<string, unknown>, id: string) => {
      if (ev.type === "text") {
        const delta = String(ev.delta ?? "");
        commit((p) => p.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)));
      } else if (ev.type === "verdict") {
        const correct = ev.correct === true;
        commit((p) =>
          p.map((m) =>
            m.id === id
              ? {
                  ...m,
                  verdict: {
                    correct,
                    reason: typeof ev.reason === "string" ? ev.reason : undefined,
                  },
                }
              : m,
          ),
        );
      } else if (ev.type === "card") {
        commit((p) => p.map((m) => (m.id === id ? { ...m, card: ev.card as Card } : m)));
      } else if (ev.type === "figure") {
        const fig = ev.figure as Figure;
        if (fig) commit((p) => p.map((m) => (m.id === id ? { ...m, figures: [...(m.figures ?? []), fig] } : m)));
      } else if (ev.type === "error") {
        setError(String(ev.message ?? "出错了"));
      }
    },
    [commit],
  );

  const callApi = useCallback(
    async (history: ReturnType<typeof toHistory>) => {
      setBusy(true);
      setError(null);
      const id = uid();
      commit((p) => [...p, { id, role: "assistant" as const, content: "" }]);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            pageContext: ctxRef.current,
            model: modelRef.current,
          }),
        });
        if (!res.ok || !res.body) throw new Error(`请求失败（${res.status}）`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const chunks = buf.split("\n\n");
          buf = chunks.pop() ?? "";
          for (const c of chunks) {
            for (const line of c.split("\n")) {
              const t = line.trim();
              if (!t.startsWith("data:")) continue;
              const d = t.slice(5).trim();
              if (!d) continue;
              try {
                handleEvent(JSON.parse(d), id);
              } catch {
                // 忽略解析异常
              }
            }
          }
        }
      } catch (e) {
        setError((e as Error).message || "模型调用失败，稍后再试一次");
      } finally {
        setBusy(false);
      }
    },
    [commit, handleEvent],
  );

  const send = useCallback(
    async (raw: string, extraImages?: string[]) => {
      const text = raw.trim();
      const images = extraImages?.length ? extraImages : pendingImages;
      if ((!text && !images.length) || busy) return;
      setPendingImages([]);
      setQuote(null);
      const next = commit((p) => [
        ...p,
        {
          id: uid(),
          role: "user" as const,
          content: text || "（我上传了一张图片）",
          ...(images.length ? { images } : {}),
        },
      ]);
      await callApi(toHistory(next));
    },
    [busy, pendingImages, commit, callApi],
  );

  const queueImages = useCallback((urls: string[]) => {
    const next = urls.filter(Boolean);
    if (!next.length) return;
    setPendingImages((prev) => [...prev, ...next.filter((u) => !prev.includes(u))].slice(-4));
  }, []);

  const clearAttachments = useCallback(() => {
    setPendingImages([]);
  }, []);

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const answerCard = useCallback(
    async (card: Card, answer: CardAnswer, msgId: string) => {
      const text = formatAnswer(card, answer);
      const next = commit((p) => [
        ...p.map((m) => (m.id === msgId ? { ...m, answered: true } : m)),
        { id: uid(), role: "user" as const, content: text },
      ]);
      await callApi(toHistory(next));
    },
    [commit, callApi],
  );

  const onImage = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请上传图片");
      return;
    }
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("读取图片失败"));
        r.readAsDataURL(file);
      });
      setPendingImages((prev) => [...prev, dataUrl].slice(-4));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const pushUserMessage = useCallback(
    (text: string) => {
      commit((p) => [...p, { id: uid(), role: "user" as const, content: text }]);
    },
    [commit],
  );

  return {
    msgs,
    busy,
    error,
    pendingImages,
    quote,
    setQuote,
    models,
    modelId,
    setModel,
    queueImages,
    setError,
    clearAttachments,
    removePendingImage,
    send,
    answerCard,
    onImage,
    pushUserMessage,
    callApi,
    toHistory,
  };
}
