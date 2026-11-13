"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { appPath } from "@/lib/app-path";
import { copyText } from "@/lib/clipboard";
import { progressStore } from "@/lib/progress/store";
import { decodeProgress, mergeProgress } from "@/lib/progress/model";

const CODE_KEY = "ch6-progress-code";

/** 学习码：无账号跨设备同步。本机进度 → 服务器换一个 8 位码；另一台设备输入码 → 合并回来。 */
export function ProgressSync({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(() => (typeof window === "undefined" ? null : localStorage.getItem(CODE_KEY)));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"push" | "pull" | null>(null);

  const push = async () => {
    setBusy("push");
    try {
      await progressStore.initialize();
      const res = await fetch(appPath("/api/progress"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, state: progressStore.getSnapshot().value }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "同步失败");
      localStorage.setItem(CODE_KEY, body.code); setCode(body.code);
      toast.success("进度已同步", { description: `学习码 ${body.code}` });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const pull = async () => {
    setBusy("pull");
    try {
      const res = await fetch(appPath(`/api/progress?code=${encodeURIComponent(input)}`));
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "读取失败");
      await progressStore.update(local => mergeProgress(local, decodeProgress(body.state)));
      localStorage.setItem(CODE_KEY, body.code); setCode(body.code); setInput("");
      toast.success("已合并另一台设备的进度");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="right" align="end" className="sync-pop">
        <p className="sync-label">本机学习码</p>
        {code ? (
          <div className="sync-code">
            <span>{code}</span>
            <Button variant="ghost" size="icon" className="size-8" aria-label="复制学习码" onClick={() => void copyText(code).then(ok => ok && toast.success("已复制"))}><Copy /></Button>
          </div>
        ) : null}
        <Button className="w-full" variant={code ? "outline" : "default"} disabled={!!busy} onClick={() => void push()}>
          <RefreshCw className={busy === "push" ? "animate-spin" : ""} />{code ? "更新同步" : "生成学习码"}
        </Button>
        <p className="sync-label mt-5">在这台设备上恢复</p>
        <div className="flex gap-2">
          <Input value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" maxLength={9} className="font-mono tracking-widest" />
          <Button size="icon" aria-label="恢复进度" disabled={!!busy || input.replace(/[^0-9A-Z]/g, "").length !== 8} onClick={() => void pull()}><ArrowRight /></Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
