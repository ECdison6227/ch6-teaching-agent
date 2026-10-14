"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { materialSections } from "@/lib/material-catalog";

export function MaterialsView() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const downloadMaterial = (key: string, href: string, filename: string) => {
    if (downloading) return;
    setDownloading(key);
    setDownloadError(null);
    void (async () => {
      try {
        const res = await fetch(href);
        if (!res.ok) {
          let message = "下载失败";
          try {
            const body = (await res.json()) as { error?: string };
            if (body?.error) message = body.error;
          } catch {
            /* 响应不是 JSON */
          }
          throw new Error(message);
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (e) {
        setDownloadError(e instanceof Error ? e.message : "下载失败");
      } finally {
        setDownloading(null);
      }
    })();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3 pt-2">
        <SidebarTrigger />
        <h1 className="text-sm font-medium">资料下载</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>原版课件 PDF</CardTitle>
              <CardDescription>课件原图，按页序排好，不含后加的要点。</CardDescription>
            </CardHeader>
            <CardFooter className="justify-end">
              <Button
                type="button"
                disabled={downloading !== null}
                onClick={() => downloadMaterial("original", "/api/materials?kind=original", "第六章-原版课件.pdf")}
              >
                <Download />
                {downloading === "original" ? "正在生成…" : "下载原版课件"}
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>题目 PDF</CardTitle>
              <CardDescription>第六章题库，以及受扭、变形、裂缝的补充题。</CardDescription>
            </CardHeader>
            <CardFooter className="justify-end">
              <Button
                type="button"
                disabled={downloading !== null}
                onClick={() => downloadMaterial("questions", "/api/materials?kind=questions", "第六章-题目.pdf")}
              >
                <Download />
                {downloading === "questions" ? "正在生成…" : "下载题目"}
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>讲解版</CardTitle>
              <CardDescription>按课件分节下载。每一页是课件原图，下面附上这一页的重点和要点。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {materialSections.map((section) => (
                <Card key={section.id} className="flex h-full flex-col shadow-none">
                  <CardHeader className="p-4">
                    <CardTitle className="text-sm leading-snug">{section.label}</CardTitle>
                    <CardDescription>{section.pages} 页</CardDescription>
                  </CardHeader>
                  <CardFooter className="mt-auto justify-end p-4 pt-0">
                    <Button
                      type="button"
                      variant="outline"
                      title={section.label}
                      disabled={downloading !== null}
                      onClick={() =>
                        downloadMaterial(
                          section.id,
                          `/api/materials?kind=explain&section=${encodeURIComponent(section.id)}`,
                          `第六章-讲解版-${section.label}.pdf`,
                        )
                      }
                    >
                      <Download />
                      {downloading === section.id ? "正在生成…" : "下载"}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </CardContent>
          </Card>
          {downloadError ? <p className="text-sm text-muted-foreground">{downloadError}</p> : null}
        </div>
      </div>
    </div>
  );
}
