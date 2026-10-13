import { NextRequest } from "next/server";
import { getProvider, ModelConfigError, resolveChatModel, type ChatMessage } from "@/lib/models/provider";
import { buildSystemPrompt, type PageContext } from "@/lib/prompt";
import { CardSchema, VerdictSchema, type Card, type Figure } from "@/lib/cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FENCE_VERDICT = "```verdict";
const FENCE_CARD = "```card";
const FENCE_DIAGRAM = "```diagram";
const FENCE_SLIDES = "```slides";
const FENCE_SLIDE = "```slide";
const MAX_PAGE = 148;
const VERDICT_RE = /^\[判定\]\s*([^·|｜:：,，\s]+)\s*[·|｜:：,，]?\s*(K\d+)?\s*[·|｜:：,，]?\s*(.*)$/;

/** 解析判定行；返回 true 表示这行确实是判定行（无论是否计入掌握度） */
function emitVerdict(raw: string, send: (e: StreamEvent) => void): boolean {
  const m = raw.trim().match(VERDICT_RE);
  if (!m) return false;
  const token = m[1].trim();
  const topic = m[2] || undefined;
  const reason = m[3] || undefined;
  if (/^(对|正确|√|✔)$/.test(token)) {
    send({ type: "verdict", correct: true, reason, topic });
  } else if (/^(错|错误|不对|×|✘)$/.test(token)) {
    send({ type: "verdict", correct: false, reason, topic });
  }
  // 其他情况（条件不足 / 不确定）不发判定，也不计入掌握度
  return true;
}

type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "verdict"; correct: boolean; reason?: string; topic?: string }
  | { type: "card"; card: Card }
  | { type: "figure"; figure: Figure }
  | { type: "error"; message: string }
  | { type: "done" };

export async function POST(req: NextRequest) {
  let body: { messages?: ChatMessage[]; pageContext?: PageContext | null; model?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("请求体不是合法 JSON", { status: 400 });
  }

  const history = (body.messages ?? []).slice(-24);
  const system = await buildSystemPrompt(body.pageContext ?? null);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));

      try {
        const choice = resolveChatModel(typeof body.model === "string" ? body.model : undefined);
        if (!choice) {
          send({ type: "error", message: "没有可用的对话模型。请先配好模型通道。" });
        } else {
          const provider = getProvider(choice.provider);
          await pump(provider, [{ role: "system", content: system }, ...history], send, choice.model);
        }
      } catch (err) {
        const msg =
          err instanceof ModelConfigError
            ? err.message
            : (err as Error)?.message || "模型调用出错";
        send({ type: "error", message: msg });
      }
      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

type FenceKind = "verdict" | "card" | "diagram" | "slides" | "slide";
/** 长标记在前，避免 ```slides 被 ```slide 截走 */
const FENCES: [FenceKind, string][] = [
  ["verdict", FENCE_VERDICT],
  ["card", FENCE_CARD],
  ["diagram", FENCE_DIAGRAM],
  ["slides", FENCE_SLIDES],
  ["slide", FENCE_SLIDE],
];

/** 边流式输出讲解文本，边捕获 verdict / card / diagram / slide 围栏块 */
async function pump(
  provider: ReturnType<typeof getProvider>,
  messages: ChatMessage[],
  send: (e: StreamEvent) => void,
  model?: string,
) {
  let buf = "";
  let mode: "text" | "fence" = "text";
  let fenceKind: FenceKind | null = null;
  let fenceBuf = "";
  let verdictChecked = false;
  const KEEP = 12;

  for await (const delta of provider.chat(messages, undefined, model)) {
    if (mode === "text") {
      buf += delta;

      // 首行判定标记：[判定] 对·K5·理由
      // 关键：判定行未确认前，一个字都不往外吐，否则标记会被当成讲解文本显示出来
      if (!verdictChecked) {
        const nl = buf.indexOf("\n");
        if (nl >= 0) {
          const first = buf.slice(0, nl);
          if (emitVerdict(first, send)) buf = buf.slice(nl + 1);
          verdictChecked = true;
        } else {
          const head = buf.trimStart();
          if (head.length > 6 && !head.startsWith("[判定")) {
            verdictChecked = true; // 首行不是判定标记，这轮没有判定
          } else {
            continue; // 还在等判定行结束，先按住不输出
          }
        }
      }
      // 找最早出现的围栏块
      let idx = -1;
      let kind: FenceKind | null = null;
      for (const [k, tag] of FENCES) {
        const at = buf.indexOf(tag);
        if (at >= 0 && (idx < 0 || at < idx)) {
          idx = at;
          kind = k;
        }
      }

      if (idx >= 0 && kind) {
        const before = buf.slice(0, idx);
        if (before) send({ type: "text", delta: before });
        mode = "fence";
        fenceKind = kind;
        fenceBuf = buf.slice(idx + (FENCES.find(([k]) => k === kind)![1].length));
        buf = "";
      } else {
        const keep = Math.min(buf.length, KEEP);
        const safe = buf.slice(0, buf.length - keep);
        if (safe) send({ type: "text", delta: safe });
        buf = buf.slice(buf.length - keep);
      }
    } else {
      fenceBuf += delta;
      const end = fenceBuf.indexOf("```");
      if (end >= 0) {
        handleFence(fenceKind!, fenceBuf.slice(0, end), send);
        const rest = fenceBuf.slice(end + 3);
        fenceBuf = "";
        mode = "text";
        fenceKind = null;
        buf = rest;
      }
    }
  }

  if (mode === "fence" && fenceBuf.trim()) {
    handleFence(fenceKind!, fenceBuf, send);
  } else if (buf.trim()) {
    // 收尾时再试一次判定行（模型可能没换行）
    if (!verdictChecked && emitVerdict(buf, send)) {
      buf = "";
    }
    if (buf.trim()) send({ type: "text", delta: buf });
  }
}

/** 解析 ```slide / ```slides 围栏：支持「64」、 「64-75」、 「64,66,70」 */
function parseSlidePages(raw: string): number[] {
  const pages = new Set<number>();
  const parts = raw
    .trim()
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    const range = part.match(/^(\d+)\s*[-~～到至]\s*(\d+)$/);
    if (range) {
      let a = Number(range[1]);
      let b = Number(range[2]);
      if (a > b) [a, b] = [b, a];
      if (b - a > 30) b = a + 30;
      for (let i = a; i <= b; i++) if (i >= 1 && i <= MAX_PAGE) pages.add(i);
      continue;
    }
    const n = Number.parseInt(part, 10);
    if (n >= 1 && n <= MAX_PAGE) pages.add(n);
  }
  return [...pages].sort((a, b) => a - b);
}

function handleFence(kind: FenceKind, raw: string, send: (e: StreamEvent) => void) {
  // 流程图是 HTML 片段，不走 JSON
  if (kind === "diagram") {
    const html = raw.trim();
    if (html) send({ type: "figure", figure: { kind: "diagram", html } });
    return;
  }
  if (kind === "slide" || kind === "slides") {
    const pages = parseSlidePages(raw);
    if (pages.length === 1) send({ type: "figure", figure: { kind: "slide", page: pages[0] } });
    else if (pages.length > 1) send({ type: "figure", figure: { kind: "slides", pages } });
    return;
  }

  let text = raw.trim();
  if (!text.startsWith("{")) {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s >= 0 && e > s) text = text.slice(s, e + 1);
  }
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    if (kind === "card") send({ type: "error", message: `卡片 JSON 解析失败：${text.slice(0, 120)}` });
    return;
  }

  if (kind === "verdict") {
    const v = VerdictSchema.safeParse(obj);
    if (v.success) {
      send({ type: "verdict", correct: v.data.correct, reason: v.data.reason, topic: v.data.topic });
    }
    return;
  }

  const c = CardSchema.safeParse(obj);
  if (c.success) {
    send({ type: "card", card: c.data });
  } else {
    send({
      type: "error",
      message: `卡片格式不合法：${c.error.issues.map((i) => i.message).join("；")}`,
    });
  }
}
