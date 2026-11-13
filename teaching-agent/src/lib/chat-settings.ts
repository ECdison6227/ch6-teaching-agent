"use client";

import { useCallback, useEffect, useState } from "react";

export const REASONING_EFFORTS = ["none", "low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type ChatSettings = {
  effort: ReasoningEffort;
  model?: string;
};

const STORAGE_KEY = "seu-chat-settings";
const DEFAULT_SETTINGS: ChatSettings = { effort: "low" };

function isEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && (REASONING_EFFORTS as readonly string[]).includes(value);
}

function normalize(raw: unknown): ChatSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const data = raw as Partial<ChatSettings>;
  return {
    effort: isEffort(data.effort) ? data.effort : DEFAULT_SETTINGS.effort,
    ...(typeof data.model === "string" && data.model.trim() ? { model: data.model.trim() } : {}),
  };
}

/** 同步读取本地聊天设置；不可用时回退默认值。 */
export function getChatSettings(): ChatSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 合并写入本地聊天设置，返回规范化后的完整对象。 */
export function setChatSettings(patch: Partial<ChatSettings>): ChatSettings {
  const next = normalize({ ...getChatSettings(), ...patch });
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / private mode */
    }
  }
  return next;
}

/** React hook：effort / model 持久化到 localStorage，默认 effort 为 low。 */
export function useChatSettings() {
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(getChatSettings());
  }, []);

  const update = useCallback((patch: Partial<ChatSettings>) => {
    const next = setChatSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return {
    effort: settings.effort,
    model: settings.model,
    setEffort: useCallback((effort: ReasoningEffort) => update({ effort }), [update]),
    setModel: useCallback((model: string | undefined) => update({ model }), [update]),
    updateSettings: update,
  };
}
