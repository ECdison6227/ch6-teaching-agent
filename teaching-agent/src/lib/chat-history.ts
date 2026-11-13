"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Msg } from "@/lib/useChat";

/** AI 助教的本机会话记录：最多 20 个会话，不存图片，只在这台设备上。 */
const KEY = "ch6-chat-sessions-v1";
const MAX = 20;

export type ChatSession = { id: string; title: string; updatedAt: number; msgs: Msg[] };

function load(): ChatSession[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as ChatSession[]; } catch { return []; }
}
function save(list: ChatSession[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* 空间不足时放弃最老的 */ try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 8))); } catch { /* ignore */ } }
}
const strip = (msgs: Msg[]): Msg[] => msgs
  .filter(m => m.status !== "streaming")
  .map(({ images, figures, ...m }) => ({ ...m, ...(images?.length ? { content: m.content || "（图片）" } : {}), ...(figures ? { figures } : {}) }));
const titleOf = (msgs: Msg[]) => (msgs.find(m => m.role === "user")?.displayContent || msgs.find(m => m.role === "user")?.content || "新对话").replace(/\s+/g, " ").slice(0, 28);
const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * 把一套 useChat 的消息和本机会话列表绑起来：
 * 生成结束时自动存；新建、切换、删除会话。
 */
export function useChatHistory(msgs: Msg[], busy: boolean, replace: (msgs: Msg[]) => void) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const loaded = useRef(false);

  useEffect(() => {
    const list = load();
    setSessions(list);
    setCurrentId(newId());
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current || busy || !msgs.length || !currentId) return;
    setSessions(prev => {
      const entry: ChatSession = { id: currentId, title: titleOf(msgs), updatedAt: Date.now(), msgs: strip(msgs) };
      const next = [entry, ...prev.filter(s => s.id !== currentId)];
      save(next);
      return next;
    });
  }, [msgs, busy, currentId]);

  const startNew = useCallback(() => { replace([]); setCurrentId(newId()); }, [replace]);
  const open = useCallback((id: string) => {
    const s = load().find(x => x.id === id);
    if (!s) return;
    replace(s.msgs.map(m => ({ ...m, status: m.status === "streaming" ? "stopped" : m.status })));
    setCurrentId(id);
  }, [replace]);
  const remove = useCallback((id: string) => {
    setSessions(prev => { const next = prev.filter(s => s.id !== id); save(next); return next; });
    if (id === currentId) startNew();
  }, [currentId, startNew]);

  return { sessions, currentId, startNew, open, remove };
}
