"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { coverPage, materialSections } from "@/lib/material-catalog";
import { MATERIAL_PDF_VERSION } from "@/lib/material-version";
import { appPath } from "@/lib/app-path";

const versioned = (path: string) => appPath(`${path}${path.includes("?") ? "&" : "?"}v=${MATERIAL_PDF_VERSION}`);
const slideThumb = (page: number) => appPath(`/slides/slide-${String(page).padStart(3, "0")}.png`);
type DownloadRequest = { key: string; href: string; filename: string };

export function MaterialsView() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [failed, setFailed] = useState<DownloadRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const downloadMaterial = async (request: DownloadRequest) => {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    setDownloading(request.key); setError(null); setFailed(null); setNotice("");
    try {
      const res = await fetch(request.href, { signal: abort.signal });
      if (!res.ok) { const body = await res.json().catch(() => null); throw new Error(body?.error || `下载失败（${res.status}）`); }
      const blob = await res.blob(); abort.signal.throwIfAborted();
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = request.filename; document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("文件已准备好，下载已开始。");
    } catch (e) {
      if (abort.signal.aborted) setNotice("已取消下载，可以重新选择资料。");
      else { setError(e instanceof Error ? e.message : "下载失败，请重试"); setFailed(request); }
    } finally { if (controller.current === abort) { controller.current = null; setDownloading(null); } }
  };
  const items = [
    { key: "original", category: "original", title: "原版课件 PDF", description: "148 页 · 完整课件", image: slideThumb(coverPage), href: versioned("/api/materials?kind=original"), filename: "第六章-原版课件.pdf", action: "下载原版课件" },
    { key: "questions", category: "questions", title: "题目 PDF", description: "第六章及教材补充题", image: appPath("/api/materials/preview"), href: versioned("/api/materials?kind=questions"), filename: "第六章-题目.pdf", action: "下载题目" },
    ...materialSections.map(section => ({ key: section.id, category: "explain", title: section.label, description: `${section.pages} 页 · 课件与逐页讲解`, image: slideThumb(section.firstPage), href: versioned(`/api/materials?kind=explain&section=${encodeURIComponent(section.id)}`), filename: `第六章-讲解版-${section.label}.pdf`, action: "下载讲解版" })),
  ];
  const results = items.filter(item => (category === "all" || item.category === category) && `${item.title} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="flex h-full min-h-0 flex-col">
    <header className="kimi-toolbar"><SidebarTrigger /><span>资料下载</span></header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="kimi-page kimi-catalog">
        <div className="kimi-page-heading"><div><h1 >资料下载</h1><p >课件、讲解与练习，随时带走。</p></div><label className="relative w-full sm:w-64"><Search aria-hidden className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="搜索资料" placeholder="搜索章节或资料" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" /></label></div>
        <div className="kimi-category-tabs" role="group" aria-label="资料分类">{[["all","全部资料"],["original","原版课件"],["explain","逐页讲解"],["questions","题目"]].map(([id,label]) => <Button key={id} variant="ghost" aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</Button>)}</div>
        <div role="status" className="mb-4 text-xs text-muted-foreground">{notice || (downloading ? "正在准备文件…" : `共 ${results.length} 份资料`)}</div>
        {error ? <Card className="mb-5 border-destructive/30 bg-destructive/5 p-4"><p role="alert" className="text-sm text-destructive">{error}</p>{failed ? <Button className="mt-2" variant="outline" onClick={() => void downloadMaterial(failed)}><RefreshCw />重试下载</Button> : null}</Card> : null}
        {downloading ? <Button variant="outline" className="mb-4" onClick={() => controller.current?.abort()}>取消下载</Button> : null}
        {results.length ? <div className="grid gap-4 sm:grid-cols-2">{results.map(item => <Card key={item.key} className="kimi-material-card flex flex-col">
          <CardHeader className="flex-row items-start gap-4 space-y-0 p-5"><img src={item.image} alt={`${item.title} 预览`} className="h-16 w-16 shrink-0 rounded-xl border object-cover object-top" loading="lazy" decoding="async" /><div className="min-w-0"><CardTitle className="text-sm font-medium leading-6">{item.title}</CardTitle><CardDescription className="mt-2 text-xs leading-5">{item.description}</CardDescription></div></CardHeader>
          <CardFooter className="mt-auto justify-end px-5 pb-4 pt-0"><Button variant="outline" disabled={!!downloading} onClick={() => void downloadMaterial(item)} className="rounded-full"><span aria-hidden className="kimi-source-icon" style={{ maskImage: `url(${appPath("/design/kimi-web/download.svg")})` }} />{downloading === item.key ? "正在准备…" : item.action}</Button></CardFooter>
        </Card>)}</div> : <Card className="kimi-empty p-10 text-center"><CardContent className="p-0"><Search className="mx-auto mb-4 size-7 text-muted-foreground" /><p className="text-sm">没有找到匹配的资料</p><p className="mt-2 text-xs text-muted-foreground">试试其他关键词，或返回全部资料。</p><Button variant="outline" className="mt-5 rounded-full" onClick={() => { setQuery(""); setCategory("all"); }}>清除筛选</Button></CardContent></Card>}
      </div>
    </div>
  </div>;
}
