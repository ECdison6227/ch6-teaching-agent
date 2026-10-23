import slides from "@/content/slides.json";
import type { StreamEvent } from "./chat-protocol";

type Message = { role: string; content: string | { type: string; text?: string }[] };
type Context = { section?: string } | null | undefined;
const topicOf = (text: string) => text.match(/\bK(?:1[0-4]|[1-9])\b/i)?.[0].toUpperCase();
const topicHints: [string, RegExp][] = [
  ["K14", /裂缝宽度/], ["K13", /挠度|变形验算/], ["K12", /受扭|弯剪扭/],
  ["K6", /双筋|受压钢筋/], ["K7", /T\s*[形型]截面|翼缘/],
  ["K3", /三个受力阶段|三种破坏|破坏形态/],
  ["K5", /单筋|矩形截面|会不会超筋|超筋判断/],
];

/** Enforce the existing first-lesson rule even when the model skips it. */
export function createFirstTurnGuide(messages: Message[], context: Context, send: (event: StreamEvent) => void) {
  const initial = !messages.some(message => message.role === "assistant");
  const content = messages.findLast(message => message.role === "user")?.content;
  const question = typeof content === "string" ? content : content?.filter(part => part.type === "text").map(part => part.text || "").join("\n") || "";
  let text = "", cardTopic: string | undefined, figure = false, failed = false;
  return {
    instruction: initial ? "\n【本轮执行状态】这是会话首轮，尚未讲解。先讲解并引用相关课件；本轮禁止输出判定行、verdict 或任何 card。缺少计算条件时先教判断方法，下一轮才用 data 卡补数据。教材节没有 PPT 时只讲解。" : "",
    emit(event: StreamEvent) {
      if (initial && event.type === "card") { cardTopic ||= event.card.topic; return; }
      if (initial && event.type === "verdict") return;
      if (event.type === "text") text = (text + event.delta).slice(0, 8000);
      if (event.type === "figure") figure = true;
      if (event.type === "error") failed = true;
      send(event);
    },
    finish() {
      if (!initial || figure || failed || !text.trim()) return;
      const topic = topicOf(context?.section || "") || topicOf(question) || cardTopic || topicOf(text) || topicHints.find(([, pattern]) => pattern.test(question))?.[0];
      if (!topic) return;
      const pages = slides.filter(slide => slide.section?.startsWith(topic + " ")).map(slide => slide.page);
      if (pages.length) send({ type: "figure", figure: { kind: "slides", pages, caption: "本节课件" } });
    },
  };
}
