import { AppShell } from "@/components/AppShell";

/** 所有学习视图共用一个常驻外壳：切换路径时对话、课件进度、练习状态都不丢。 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<AppShell /></>;
}
