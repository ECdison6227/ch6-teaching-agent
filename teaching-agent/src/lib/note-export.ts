import type { Note } from "./notes-store";

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

/** 只导出本地课件或图片数据，禁止把任意笔记字符串拼进 HTML 属性。 */
export function noteImagesHtml(notes: Note[]): string {
  return notes.filter(note => note.image && (/^\/slides\/slide-\d{3}\.png$/.test(note.image) || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(note.image)))
    .map(note => `<figure><img src="${escapeHtml(note.image!)}" alt=""><figcaption>${escapeHtml(note.title)}</figcaption></figure>`).join("");
}

export function rawNotesMarkdown(notes: Note[]) {
  return notes.filter(note => note.text.trim()).map(note => `## ${note.title || "笔记"}\n\n${note.text}`).join("\n\n");
}
