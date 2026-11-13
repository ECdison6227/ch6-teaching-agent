"use client";

import { useState } from "react";
import { History, SquarePen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ChatSession } from "@/lib/chat-history";

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "刚刚" : m < 60 ? `${m} 分钟前` : m < 1440 ? `${Math.round(m / 60)} 小时前` : `${Math.round(m / 1440)} 天前`;
};

/** AI 助教顶栏右侧：历史会话 + 新对话 */
export function ChatHistoryMenu({ sessions, currentId, onOpen, onNew, onRemove, disabled }: { sessions: ChatSession[]; currentId: string; onOpen: (id: string) => void; onNew: () => void; onRemove: (id: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" disabled={disabled || !sessions.length}><History />历史</Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="chat-history">
          <p className="chat-history-label">最近对话 · 仅保存在本机</p>
          <ul>
            {sessions.map(s => (
              <li key={s.id} data-current={s.id === currentId || undefined}>
                <button type="button" className="chat-history-item" onClick={() => { onOpen(s.id); setOpen(false); }}>
                  <span className="truncate">{s.title}</span><span className="chat-history-time">{ago(s.updatedAt)}</span>
                </button>
                <button type="button" aria-label="删除这次对话" className="chat-history-del" onClick={() => onRemove(s.id)}><Trash2 className="size-3.5" /></button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="sm" onClick={onNew} disabled={disabled}><SquarePen />新对话</Button>
    </>
  );
}
