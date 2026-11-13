import { z } from "zod";
import { MAX_BLOB, formatCode, limited, normalizeCode, readProgress, writeProgress } from "@/lib/progress/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ip = (req: Request) => req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const Body = z.object({
  code: z.string().max(20).nullish(),
  state: z.object({ version: z.literal(1), viewed: z.record(z.array(z.number().int()).max(400)), attempts: z.record(z.any()), updatedAt: z.number() }),
});

/** 读取：GET /api/progress?code=K7Q2-M9XA */
export function GET(req: Request) {
  if (limited(ip(req))) return json({ error: "操作太频繁，请稍后再试" }, 429);
  const code = normalizeCode(new URL(req.url).searchParams.get("code") ?? "");
  if (!code) return json({ error: "学习码格式不对" }, 400);
  const data = readProgress(code);
  if (!data) return json({ error: "没有找到这个学习码，可能已过期" }, 404);
  return json({ code: formatCode(code), state: JSON.parse(data) });
}

/** 写入：POST { code?, state }，返回学习码 */
export async function POST(req: Request) {
  if (limited(ip(req))) return json({ error: "操作太频繁，请稍后再试" }, 429);
  const text = await req.text();
  if (text.length > MAX_BLOB) return json({ error: "进度数据过大" }, 413);
  const parsed = Body.safeParse(JSON.parse(text || "{}"));
  if (!parsed.success) return json({ error: "进度数据格式不对" }, 400);
  const code = parsed.data.code ? normalizeCode(parsed.data.code) : null;
  if (parsed.data.code && !code) return json({ error: "学习码格式不对" }, 400);
  const saved = writeProgress(JSON.stringify(parsed.data.state), code);
  return json({ code: formatCode(saved) });
}
