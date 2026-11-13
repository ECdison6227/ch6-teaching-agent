import { BookOpen, Calculator, Download, MessageSquare, PencilLine, Radio, SquareActivity, type LucideIcon } from "lucide-react";

/** 应用内的每个视图都对应一个真实路径：可刷新、可分享、可从二维码直达。 */
export type AppView = "home" | "slides" | "chat" | "practice" | "classroom" | "lab" | "demo" | "materials";

export type ViewDef = { id: AppView; path: string; label: string; icon?: LucideIcon; group?: "learn" | "practice" | "tools" | "more" };

export const VIEWS: ViewDef[] = [
  { id: "home", path: "/", label: "课程主页" },
  { id: "slides", path: "/slides", label: "课件", icon: BookOpen, group: "learn" },
  { id: "chat", path: "/chat", label: "AI 助教", icon: MessageSquare, group: "learn" },
  { id: "practice", path: "/practice", label: "练习", icon: PencilLine, group: "practice" },
  { id: "classroom", path: "/classroom", label: "课堂", icon: Radio, group: "practice" },
  { id: "lab", path: "/lab", label: "配筋计算", icon: Calculator, group: "tools" },
  { id: "demo", path: "/demo", label: "受力演示", icon: SquareActivity, group: "tools" },
  { id: "materials", path: "/materials", label: "资料下载", icon: Download, group: "tools" },
];

export const NAV_GROUPS: { id: NonNullable<ViewDef["group"]>; label: string }[] = [
  { id: "learn", label: "学习" },
  { id: "practice", label: "练习" },
  { id: "tools", label: "工具" },
];

export function viewFromPath(pathname: string | null): AppView {
  const clean = (pathname || "/").replace(/\/+$/, "") || "/";
  return VIEWS.find(v => v.path === clean)?.id ?? "home";
}

export function pathOf(view: AppView): string {
  return VIEWS.find(v => v.id === view)?.path ?? "/";
}

/** 旧版 hash 地址（/#beam-lab 等）到新路径的映射，书签和旧二维码仍能用。 */
export const LEGACY_HASH: Record<string, string> = {
  home: "/",
  chat: "/chat",
  study: "/slides",
  materials: "/materials",
  "self-test": "/practice",
  "linked-practice": "/practice?tab=linked",
  classroom: "/classroom",
  "beam-lab": "/lab",
  "reinforcement-demo": "/demo",
};
