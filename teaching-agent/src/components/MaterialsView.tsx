"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Eye, Search, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import slidesJson from "@/content/slides.json";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { coverPage, materialSections } from "@/lib/material-catalog";
import { MATERIAL_PDF_VERSION } from "@/lib/material-version";
import { appPath } from "@/lib/app-path";

const slidesIndex = slidesJson as { page: number; section: string }[];
/** 资料对应的课件页：原版是全部页，讲解版是该节的页 */
const pagesOf = (item: { key: string; category: string }) => item.category === "original" ? slidesIndex.map(s => s.page) : slidesIndex.filter(s => s.section === item.key).map(s => s.page);
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
  const [preview, setPreview] = useState<(typeof items)[number] | null>(null);
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
        <div className="kimi-page-heading"><div><h1>资料下载</h1></div><label className="relative w-full sm:w-64"><Search aria-hidden className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="搜索资料" placeholder="搜索章节或资料" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" /></label></div>
        <div className="kimi-category-tabs" role="group" aria-label="资料分类">{[["all","全部资料"],["original","原版课件"],["explain","逐页讲解"],["questions","题目"]].map(([id,label]) => <Button key={id} variant="ghost" aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</Button>)}</div>
        <div role="status" className="mb-4 text-xs text-muted-foreground">{notice || (downloading ? "正在准备文件…" : `共 ${results.length} 份资料`)}</div>
        {error ? <Card className="mb-5 border-destructive/30 bg-destructive/5 p-4"><p role="alert" className="text-sm text-destructive">{error}</p>{failed ? <Button className="mt-2" variant="outline" onClick={() => void downloadMaterial(failed)}><RefreshCw />重试下载</Button> : null}</Card> : null}
        {downloading ? <Button variant="outline" className="mb-4" onClick={() => controller.current?.abort()}>取消下载</Button> : null}
        {results.length ? <>
          {results.filter(i => i.key === "original" || i.key === "questions").length ? <div className="mat-featured">{results.filter(i => i.key === "original" || i.key === "questions").map(item => (
            <div key={item.key} className="mat-hero">
              <button type="button" className="mat-hero-thumb" onClick={() => setPreview(item)} aria-label={`预览${item.title}`}><img src={item.image} alt="" loading="lazy" /></button>
              <div className="mat-hero-body">
                <p className="mat-hero-title font-serif-cn">{item.title}</p>
                <p className="mat-hero-desc">{item.description}</p>
                <div className="mat-actions"><Button variant="ghost" size="sm" onClick={() => setPreview(item)}><Eye />预览</Button><Button size="sm" className="rounded-full" disabled={!!downloading} onClick={() => void downloadMaterial(item)}><Download />{downloading === item.key ? "正在准备…" : "下载"}</Button></div>
              </div>
            </div>
          ))}</div> : null}
          {results.filter(i => i.category === "explain").length ? <><p className="mat-group">逐页讲解版 · 按知识点</p><ul className="mat-list">{results.filter(i => i.category === "explain").map(item => (
            <li key={item.key}>
              <button type="button" className="mat-row-thumb" onClick={() => setPreview(item)} tabIndex={-1} aria-hidden="true"><img src={item.image} alt="" loading="lazy" /></button>
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{item.title}</span><span className="block text-[12px] text-muted-foreground">{item.description}</span></span>
              <Button variant="ghost" size="icon" aria-label={`预览${item.title}`} onClick={() => setPreview(item)}><Eye /></Button>
              <Button variant="outline" size="icon" className="rounded-full" aria-label={`下载${item.title}`} disabled={!!downloading} onClick={() => void downloadMaterial(item)}>{downloading === item.key ? <RefreshCw className="animate-spin" /> : <Download />}</Button>
            </li>
          ))}</ul></> : null}
        </> : <Card className="kimi-empty p-10 text-center"><CardContent className="p-0"><Search className="mx-auto mb-4 size-7 text-muted-foreground" /><p className="text-sm">没有找到匹配的资料</p><p className="mt-2 text-xs text-muted-foreground">试试其他关键词，或返回全部资料。</p><Button variant="outline" className="mt-5 rounded-full" onClick={() => { setQuery(""); setCategory("all"); }}>清除筛选</Button></CardContent></Card>}
      </div>
    </div>
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}>
      <DialogContent className="mat-preview">
        <DialogHeader><DialogTitle>{preview?.title}</DialogTitle><DialogDescription>{preview?.description}</DialogDescription></DialogHeader>
        {preview ? (preview.key === "questions" ? <img src={preview.image} alt="题目 PDF 预览" className="mat-preview-q" /> : (
          <div className="mat-preview-grid">{pagesOf(preview).slice(0, 6).map((pg, i) => <motion.img key={pg} src={slideThumb(pg)} alt={`第 ${pg} 页`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} />)}</div>
        )) : null}
        {preview ? <DialogFooter><span className="mr-auto text-xs text-muted-foreground">{preview.key === "questions" ? "" : `共 ${pagesOf(preview).length} 页，预览前 ${Math.min(6, pagesOf(preview).length)} 页`}</span><Button disabled={!!downloading} onClick={() => { const it = preview; setPreview(null); void downloadMaterial(it); }}><Download />下载 PDF</Button></DialogFooter> : null}
      </DialogContent>
    </Dialog>
  </div>;
}
