import { getFallbackProvider, getProvider, resolveChatModel } from "@/lib/models/provider";
import { buildSystemPrompt } from "@/lib/prompt";
import { createChatParser, type StreamEvent } from "@/lib/chat-protocol";
import { ChatRequestSchema, readJson, RequestValidationError } from "@/lib/request-validation";
import { requestScope, requestError } from "@/lib/request-lifecycle";
import { createFirstTurnGuide } from "@/lib/first-turn-guide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (req.signal.aborted) return Response.json({ error: "请求已停止" }, { status: 408 });
  let body;
  let system: string;
  try {
    body = await readJson(req, ChatRequestSchema);
    system = await buildSystemPrompt(body.pageContext ?? null);
  } catch (error) {
    return Response.json({ error: requestError(error, req.signal) }, {
      status: error instanceof RequestValidationError ? error.status : req.signal.aborted ? 408 : 500,
    });
  }
  const choice = resolveChatModel(body.model);
  const scope = requestScope(req.signal);
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: StreamEvent) => {
        if (closed || req.signal.aborted) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); }
        catch { closed = true; scope.abort(); }
      };
      void (async () => {
        try {
          scope.signal.throwIfAborted();
          if (!choice) send({ type: "error", message: "没有可用的对话模型。请先配好模型通道。" });
          else {
            const guide = createFirstTurnGuide(body.messages, body.pageContext, send);
            const parser = createChatParser(guide.emit);
            const messages = [{ role: "system" as const, content: system + guide.instruction }, ...body.messages];
            let emitted = false;
            try {
              const provider = getProvider(choice.provider);
              for await (const delta of provider.chat(messages, scope.signal, choice.model, { effort: body.effort })) {
                scope.signal.throwIfAborted();
                emitted = true;
                parser.push(delta);
              }
            } catch (error) {
              // 主通道还没吐出任何内容就失败：换备用通道重试一次，学生端无感
              const needsVision = body.messages.some(m => Array.isArray(m.content) && m.content.some(p => p.type === "image_url"));
              const fallback = !emitted && !scope.signal.aborted ? getFallbackProvider(choice.provider, needsVision) : null;
              if (!fallback) throw error;
              console.warn(`[chat] ${choice.provider} 失败，切换备用通道：`, error instanceof Error ? error.message : error);
              for await (const delta of fallback.provider.chat(messages, scope.signal, fallback.model)) {
                scope.signal.throwIfAborted();
                parser.push(delta);
              }
            }
            parser.end();
            guide.finish();
          }
        } catch (error) {
          if (!req.signal.aborted) send({ type: "error", message: requestError(error, scope.signal) });
        } finally {
          send({ type: "done" });
          if (!closed) { closed = true; controller.close(); }
          scope.dispose();
        }
      })();
    },
    cancel() { closed = true; scope.abort(); scope.dispose(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  } });
}
