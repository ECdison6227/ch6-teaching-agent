import { spawn } from "node:child_process";
import { readFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { findMaterialSection, materialSections } from "@/lib/material-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, ".cache", "materials");
const SCRIPT = path.join(ROOT, "scripts", "material_pdf.py");

const inflight = new Map<string, Promise<string>>();

function cacheFile(kind: string, section?: string) {
  if (kind === "original") return path.join(CACHE, "original.pdf");
  if (kind === "questions") return path.join(CACHE, "questions.pdf");
  const safe = (section ?? "").replace(/[^\w\u4e00-\u9fff·.-]+/g, "_");
  return path.join(CACHE, `explain-${safe}.pdf`);
}

function downloadName(kind: string, section?: string) {
  if (kind === "original") return "第六章-原版课件.pdf";
  if (kind === "questions") return "第六章-题目.pdf";
  return `第六章-讲解版-${section}.pdf`;
}

async function fileReady(file: string) {
  try {
    const info = await stat(file);
    return info.size > 0;
  } catch {
    return false;
  }
}

function runPython(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("python3", [SCRIPT, ...args], { cwd: ROOT });
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `生成 PDF 失败（${code}）`));
    });
  });
}

async function ensurePdf(kind: string, section?: string) {
  const file = cacheFile(kind, section);
  if (await fileReady(file)) return file;
  const key = `${kind}:${section ?? ""}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = (async () => {
    await mkdir(CACHE, { recursive: true });
    const args = ["--kind", kind, "--out", file];
    if (kind === "explain") args.push("--section", section ?? "");
    await runPython(args);
    if (!(await fileReady(file))) throw new Error("PDF 没有生成出来");
    return file;
  })().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  if (!kind) {
    return Response.json({
      sections: materialSections.map((section) => ({
        id: section.id,
        label: section.label,
        pages: section.pages,
      })),
    });
  }
  if (kind !== "original" && kind !== "questions" && kind !== "explain") {
    return Response.json({ error: "不认识的下载类型" }, { status: 400 });
  }
  const section = url.searchParams.get("section")?.trim() ?? "";
  if (kind === "explain" && !findMaterialSection(section)) {
    return Response.json({ error: "没有这一节" }, { status: 400 });
  }

  try {
    const file = await ensurePdf(kind, kind === "explain" ? section : undefined);
    const bytes = await readFile(file);
    const filename = downloadName(kind, section);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成 PDF 失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
