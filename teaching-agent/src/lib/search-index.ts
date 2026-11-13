/** ⌘K 搜索的数据源：全部在前端，打开搜索面板时才加载（动态 import）。 */
import slidesData from "@/content/slides.json";
import notesData from "@/content/slide-notes.json";
import { KNOWLEDGE_SECTIONS } from "@/lib/sections";
import { getQuestionCatalog, isUsableQuestion } from "@/lib/question-catalog";
import { displayPrompt } from "@/lib/self-test/model";
import mainTags from "@/content/question-k.json";

export type SearchItem =
  | { kind: "k"; id: string; title: string; sub: string; k: string }
  | { kind: "slide"; id: string; title: string; sub: string; k: string; page: number }
  | { kind: "question"; id: string; title: string; sub: string; k: string | null };

const clean = (s: string) => s.replace(/\$+/g, "").replace(/\\[a-zA-Z]+/g, " ").replace(/[`*#>_]/g, "").replace(/\s+/g, " ").trim();

export function buildSearchIndex(): SearchItem[] {
  const notes = notesData as Record<string, { title?: string; points?: string[] }>;
  const tags = mainTags as Record<string, { k: string }>;
  const items: SearchItem[] = [];
  for (const s of KNOWLEDGE_SECTIONS) items.push({ kind: "k", id: s.id, k: s.id, title: s.name, sub: s.only === "book" ? "教材补充" : "知识点" });
  for (const slide of slidesData as { page: number; section: string; title: string; bullets: string[] }[]) {
    const k = /^K\d+/.exec(slide.section)?.[0];
    if (!k) continue;
    const note = notes[String(slide.page)];
    const title = clean(note?.title || slide.title || slide.section);
    const sub = clean([...(note?.points ?? []), ...slide.bullets].join(" ")).slice(0, 160);
    items.push({ kind: "slide", id: `p${slide.page}`, k, page: slide.page, title, sub });
  }
  for (const q of getQuestionCatalog().filter(isUsableQuestion)) {
    items.push({ kind: "question", id: q.id, k: tags[q.id]?.k ?? null, title: clean(displayPrompt(q)).slice(0, 90), sub: clean(q.analysis ?? "").slice(0, 120) });
  }
  return items;
}
