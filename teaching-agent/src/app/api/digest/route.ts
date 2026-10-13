import { getProvider, ModelConfigError } from "@/lib/models/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `你是笔记整理员。学生在自学《钢筋混凝土梁承载力计算原理》时收藏了一些片段、课件页和做错的题。
把这些收藏整理成一份可以打印的学习笔记：
- 用 Markdown，分 2~4 个小节，每节一个小标题。
- 保留学生原文里的公式（LaTeX）和关键句，不要另起一套题。
- 做错的题单独成一节，写出题目和错在哪里，不要直接给最终数值答案。
- 只根据给出的收藏来写，没有的内容不要编。
- 不要出卡片，不要问学生问题。`;

export async function POST(req: Request) {
  let body: { notes?: { title?: string; kind?: string; text?: string }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const notes = (body.notes ?? []).filter((n) => n.text?.trim()).slice(0, 40);
  if (!notes.length) return Response.json({ error: "还没有可汇总的收藏" }, { status: 400 });

  const packed = notes
    .map((n, i) => `${i + 1}. [${n.kind || "text"}] ${n.title || ""}\n${n.text}`)
    .join("\n\n");

  try {
    const provider = getProvider();
    let markdown = "";
    for await (const delta of provider.chat([
      { role: "system", content: SYSTEM },
      { role: "user", content: packed },
    ])) {
      markdown += delta;
    }
    return Response.json({ markdown: markdown.trim() });
  } catch (err) {
    const msg = err instanceof ModelConfigError ? err.message : (err as Error)?.message || "汇总失败";
    return Response.json({ error: msg }, { status: 500 });
  }
}
