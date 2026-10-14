import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import slidesJson from "@/content/slides.json";
import notesJson from "@/content/slide-notes.json";
import questionsJson from "@/content/questions.json";
import extraQuestionsJson from "@/content/k12-14-questions.json";
import { layoutMath, type MathBox } from "@/lib/math-typeset";
import { loadPdfFont, type PdfFont, type SubsetFont } from "@/lib/ttf-font";

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const IMAGE_W = 1300;
const IMAGE_H = 975;

type Slide = { page: number; section?: string; title?: string };
type Note = { title?: string; keys?: string[]; points?: string[] };
type Question = {
  id?: string;
  type?: string;
  prompt?: string;
  options?: { id?: string; text?: string }[];
  answer?: string | null;
  analysis?: string | null;
};
type PageOp =
  | { kind: "text"; text: string; x: number; y: number; size: number; color: string; italic?: boolean }
  | { kind: "rect"; x: number; y: number; width: number; height: number; color: string }
  | { kind: "image"; name: string; x: number; y: number; width: number; height: number; bytes: Buffer };
type PdfPage = { ops: PageOp[] };
type TextOp = Extract<PageOp, { kind: "text" }>;
type ObjectValue = Buffer | string;

const INK = "0.10 0.10 0.09";
const HIGHLIGHT = "0.99 0.90 0.53";
const slides = slidesJson as Slide[];
const notes = notesJson as Record<string, Note>;

function pdfNumber(value: number) {
  return String(Number(value.toFixed(3)));
}

function hex4(value: number) {
  return value.toString(16).padStart(4, "0").toUpperCase();
}

function utf16Hex(codePoint: number) {
  if (codePoint <= 0xffff) return hex4(codePoint);
  const scalar = codePoint - 0x10000;
  return hex4(0xd800 + (scalar >> 10)) + hex4(0xdc00 + (scalar & 0x3ff));
}

/** 字体里没有这个字形时换成的等价写法，换不出来就丢掉这个字符 */
const GLYPH_SUBSTITUTES: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "₊": "+", "₋": "-", "₌": "=", "₍": "(", "₎": ")", "ₙ": "n",
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-", "⁼": "=", "⁽": "(", "⁾": ")", "ⁿ": "n",
  "≪": "<<", "≫": ">>", "\u2212": "-",
};

function glyphOf(font: PdfFont, char: string) {
  return font.glyphFor(char.codePointAt(0) ?? 0);
}

/** 把字体渲染不了的字符换掉，剩下的记下来方便排查 */
function shapeLine(font: PdfFont, text: string, missing: Set<string>) {
  let output = "";
  for (const char of text) {
    if (glyphOf(font, char)) {
      output += char;
      continue;
    }
    const substitute = GLYPH_SUBSTITUTES[char];
    if (substitute && [...substitute].every((value) => glyphOf(font, value))) {
      output += substitute;
      continue;
    }
    if (char !== " " && char !== "\t") missing.add(char);
  }
  return output;
}

function makePdf(objects: ObjectValue[], rootId: number) {
  const chunks: Buffer[] = [Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "binary")];
  const offsets: number[] = [0];
  let length = chunks[0].length;
  objects.forEach((value, index) => {
    const body = Buffer.isBuffer(value) ? value : Buffer.from(value, "ascii");
    const start = Buffer.from(`${index + 1} 0 obj\n`, "ascii");
    const end = Buffer.from("\nendobj\n", "ascii");
    offsets.push(length);
    chunks.push(start, body, end);
    length += start.length + body.length + end.length;
  });
  const xrefOffset = length;
  const xref = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "];
  for (let id = 1; id <= objects.length; id += 1) {
    xref.push(`${String(offsets[id]).padStart(10, "0")} 00000 n `);
  }
  const trailer = `${xref.join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root ${rootId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(trailer, "ascii"));
  return Buffer.concat(chunks, length + Buffer.byteLength(trailer));
}

function addObject(objects: ObjectValue[], value: ObjectValue) {
  objects.push(value);
  return objects.length;
}

function addStream(objects: ObjectValue[], dictionary: string, data: Buffer) {
  const header = Buffer.from(`<< ${dictionary} /Length ${data.length} >>\nstream\n`, "ascii");
  const footer = Buffer.from("\nendstream", "ascii");
  return addObject(objects, Buffer.concat([header, data, footer]));
}

function addPages(objects: ObjectValue[], pages: { content: number; resources: string; width: number; height: number }[]) {
  const treeId = addObject(objects, "");
  const childIds = pages.map((page) => addObject(
    objects,
    `<< /Type /Page /Parent ${treeId} 0 R /MediaBox [0 0 ${pdfNumber(page.width)} ${pdfNumber(page.height)}] /Resources ${page.resources} /Contents ${page.content} 0 R >>`,
  ));
  objects[treeId - 1] = `<< /Type /Pages /Kids [${childIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${childIds.length} >>`;
  return addObject(objects, `<< /Type /Catalog /Pages ${treeId} 0 R >>`);
}

const imageCache = new Map<number, Promise<Buffer>>();

function readSlideImage(page: number) {
  let pending = imageCache.get(page);
  if (!pending) {
    pending = (async () => {
      const filename = path.join(process.cwd(), "public", "slides", `slide-${String(page).padStart(3, "0")}.png`);
      const png = await readFile(filename);
      if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`第 ${page} 页课件图无法读取`);
      let width = 0;
      let height = 0;
      let bitDepth = 0;
      let colorType = 0;
      let interlace = 0;
      const data: Buffer[] = [];
      for (let offset = 8; offset + 12 <= png.length;) {
        const length = png.readUInt32BE(offset);
        const end = offset + 12 + length;
        if (end > png.length) throw new Error(`第 ${page} 页课件图数据不完整`);
        const type = png.toString("ascii", offset + 4, offset + 8);
        if (type === "IHDR") {
          const header = png.subarray(offset + 8, offset + 8 + length);
          width = header.readUInt32BE(0);
          height = header.readUInt32BE(4);
          bitDepth = header[8];
          colorType = header[9];
          interlace = header[12];
        } else if (type === "IDAT") {
          data.push(png.subarray(offset + 8, offset + 8 + length));
        } else if (type === "IEND") {
          break;
        }
        offset = end;
      }
      if (width !== IMAGE_W || height !== IMAGE_H || bitDepth !== 8 || colorType !== 2 || interlace !== 0) {
        throw new Error(`第 ${page} 页课件图格式不受支持`);
      }
      return Buffer.concat(data);
    })();
    imageCache.set(page, pending);
  }
  return pending;
}

async function addPngImage(objects: ObjectValue[], page: number) {
  return addStream(
    objects,
    `/Type /XObject /Subtype /Image /Width ${IMAGE_W} /Height ${IMAGE_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${IMAGE_W} >>`,
    await readSlideImage(page),
  );
}

async function buildOriginal() {
  const objects: ObjectValue[] = [];
  const pages = [];
  for (const slide of slides) {
    const imageId = await addPngImage(objects, slide.page);
    const contentId = addStream(objects, "", Buffer.from("q 720 0 0 540 0 0 cm /Im1 Do Q\n", "ascii"));
    pages.push({ content: contentId, resources: `<< /XObject << /Im1 ${imageId} 0 R >> >>`, width: 720, height: 540 });
  }
  return makePdf(objects, addPages(objects, pages));
}

function textWidth(font: PdfFont, value: string, size: number) {
  let units = 0;
  for (const char of value) {
    const gid = glyphOf(font, char);
    units += gid ? font.advanceEm(gid) : (char.codePointAt(0) ?? 0) < 128 ? 500 : 1000;
  }
  return (units * size) / 1000;
}

/** 一行的排版单元：普通文字、公式盒子，或一个空格 */
type Atom =
  | { kind: "text"; text: string; size: number; highlight: boolean; color: string }
  | { kind: "math"; box: MathBox; color: string }
  | { kind: "space"; width: number };

type Line = { atoms: Atom[]; width: number; ascent: number; descent: number };

function atomWidth(font: PdfFont, atom: Atom) {
  if (atom.kind === "text") return textWidth(font, atom.text, atom.size);
  if (atom.kind === "math") return atom.box.width;
  return atom.width;
}

/** 关键词在正文里的位置：$...$ 里的公式不参与高亮 */
function highlightMask(value: string, keys: string[]) {
  const mask = new Array<boolean>(value.length).fill(false);
  const mathSpans: Array<[number, number]> = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "$") continue;
    const end = value.indexOf("$", index + 1);
    if (end < 0) break;
    mathSpans.push([index, end]);
    index = end;
  }
  for (const key of keys) {
    const term = key.trim();
    if (!term) continue;
    let from = value.indexOf(term);
    while (from >= 0) {
      const insideMath = mathSpans.some(([start, end]) => from < end && from + term.length > start);
      if (!insideMath) {
        for (let index = from; index < from + term.length; index += 1) mask[index] = true;
      }
      from = value.indexOf(term, from + term.length);
    }
  }
  return mask;
}

function buildAtoms(font: PdfFont, value: string, size: number, color: string, keys: string[], missing: Set<string>): Atom[] {
  const mask = keys.length ? highlightMask(value, keys) : null;
  const atoms: Atom[] = [];
  let buffer = "";
  let highlighted = false;
  const flush = () => {
    if (!buffer) return;
    const shaped = shapeLine(font, buffer, missing);
    if (shaped) atoms.push({ kind: "text", text: shaped, size, highlight: highlighted, color });
    buffer = "";
  };
  let index = 0;
  while (index < value.length) {
    const char = value[index];
    if (char === "$") {
      const end = value.indexOf("$", index + 1);
      if (end > index) {
        flush();
        atoms.push({ kind: "math", box: layoutMath(value.slice(index + 1, end), size, font), color });
        index = end + 1;
        continue;
      }
    }
    if (/\s/.test(char)) {
      flush();
      atoms.push({ kind: "space", width: size * 0.3 });
      index += 1;
      continue;
    }
    const hi = mask ? !!mask[index] : false;
    if (hi !== highlighted) {
      flush();
      highlighted = hi;
    }
    buffer += char;
    // 中文可以逐字断行，西文只在词边界断
    if (char.charCodeAt(0) > 0x2e7f || "，。；：！？、）】》".includes(char)) flush();
    index += 1;
  }
  flush();
  return atoms;
}

function layoutLines(font: PdfFont, atoms: Atom[], size: number): Line[] {
  const lines: Line[] = [];
  let current: Atom[] = [];
  let width = 0;
  let ascent = size * 0.74;
  let descent = size * 0.22;
  const push = () => {
    while (current.length && current[current.length - 1].kind === "space") {
      width -= atomWidth(font, current[current.length - 1]);
      current.pop();
    }
    if (current.length) lines.push({ atoms: current, width, ascent, descent });
    current = [];
    width = 0;
    ascent = size * 0.74;
    descent = size * 0.22;
  };
  for (const atom of atoms) {
    const atomW = atomWidth(font, atom);
    if (current.length && width + atomW > CONTENT_W) push();
    if (!current.length && atom.kind === "space") continue;
    current.push(atom);
    width += atomW;
    if (atom.kind === "math") {
      ascent = Math.max(ascent, atom.box.ascent);
      descent = Math.max(descent, atom.box.descent);
    }
  }
  push();
  return lines;
}

class Writer {
  readonly pages: PdfPage[] = [];
  readonly missingChars = new Set<string>();
  private page: PdfPage | null = null;
  private y = MARGIN;

  constructor(private readonly font: PdfFont) {}

  private newPage() {
    this.page = { ops: [] };
    this.pages.push(this.page);
    this.y = MARGIN;
  }

  private need(height: number) {
    if (!this.page || this.y + height > PAGE_H - MARGIN) this.newPage();
  }

  remaining() {
    return PAGE_H - MARGIN - this.y;
  }

  ensureSpace(height: number) {
    this.need(height);
  }

  /** 写一段正文：支持 $公式$、关键词高亮，行距按内容（含分数、根号）自适应 */
  text(value: string, size = 11, gap = 4, color = INK, keys: string[] = []) {
    for (const line of layoutLines(this.font, buildAtoms(this.font, value, size, color, keys, this.missingChars), size)) {
      const extra = Math.max(0, line.ascent - size * 0.74) + Math.max(0, line.descent - size * 0.22);
      const leading = size * 1.5 + gap + extra;
      this.need(leading);
      const baseline = PAGE_H - this.y - line.ascent;
      const ops = this.page!.ops;
      let x = MARGIN;
      for (const atom of line.atoms) {
        const width = atomWidth(this.font, atom);
        if (atom.kind === "text") {
          if (atom.highlight) {
            ops.push({
              kind: "rect",
              x,
              y: baseline - atom.size * 0.24,
              width: width + atom.size * 0.06,
              height: atom.size * 1.02,
              color: HIGHLIGHT,
            });
          }
          ops.push({ kind: "text", text: atom.text, x, y: baseline, size: atom.size, color: atom.color });
        } else if (atom.kind === "math") {
          for (const item of atom.box.items) {
            if (item.kind === "text") {
              ops.push({ kind: "text", text: item.text, x: x + item.dx, y: baseline + item.dy, size: item.size, color: atom.color, italic: item.italic });
            } else {
              ops.push({
                kind: "rect",
                x: x + item.dx,
                y: baseline + item.dy - item.thickness / 2,
                width: item.width,
                height: item.thickness,
                color: atom.color,
              });
            }
          }
        }
        x += width;
      }
      this.y += leading;
    }
  }

  gap(height = 8) {
    this.y += height;
  }

  async image(page: number, maxHeight: number) {
    let width = CONTENT_W;
    let height = (width * IMAGE_H) / IMAGE_W;
    if (height > maxHeight) {
      height = maxHeight;
      width = (height * IMAGE_W) / IMAGE_H;
    }
    this.need(height);
    const x = MARGIN + (CONTENT_W - width) / 2;
    this.page!.ops.push({ kind: "image", name: `Im${page}`, x, y: PAGE_H - this.y - height, width, height, bytes: await readSlideImage(page) });
    this.y += height;
  }
}

/** CIDFontType2 的 /W：连续且等宽的字形并成一段写 */
function widthArray(subset: SubsetFont) {
  const gids = [...subset.widths.keys()].sort((a, b) => a - b);
  const widthOf = (gid: number) => Math.round((subset.widths.get(gid)! * 1000) / subset.unitsPerEm);
  const entries: string[] = [];
  let index = 0;
  while (index < gids.length) {
    const start = gids[index];
    const width = widthOf(start);
    let end = start;
    while (index + 1 < gids.length && gids[index + 1] === end + 1 && widthOf(gids[index + 1]) === width) {
      index += 1;
      end = gids[index];
    }
    entries.push(`${start} ${end} ${width}`);
    index += 1;
  }
  return entries.join(" ");
}

/** 让 PDF 里的文字能选中、能搜索 */
function toUnicodeCMap(subset: SubsetFont) {
  const entries = [...subset.unicodeFor].sort((a, b) => a[0] - b[0]);
  const lines = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /Adobe-Identity-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
  ];
  for (let index = 0; index < entries.length; index += 100) {
    const chunk = entries.slice(index, index + 100);
    lines.push(`${chunk.length} beginbfchar`);
    for (const [gid, codePoint] of chunk) lines.push(`<${hex4(gid)}> <${utf16Hex(codePoint)}>`);
    lines.push("endbfchar");
  }
  lines.push("endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end");
  return lines.join("\n");
}

function renderWriterPdf(writer: Writer, font: PdfFont) {
  const used = writer.pages
    .flatMap((page) => page.ops)
    .map((op) => (op.kind === "text" ? op.text : ""))
    .join("");
  if (writer.missingChars.size) {
    console.warn(`[materials] 字体里没有这些字符，已跳过：${[...writer.missingChars].join("")}`);
  }
  const subset = font.subset(used);

  const objects: ObjectValue[] = [];
  const fontFileId = addStream(objects, `/Filter /FlateDecode /Length1 ${subset.data.length}`, deflateSync(subset.data));
  const descriptorId = addObject(
    objects,
    `<< /Type /FontDescriptor /FontName /${subset.name} /Flags 4 /FontBBox [${subset.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${subset.ascent} /Descent ${subset.descent} /CapHeight ${subset.capHeight} /StemV 80 /FontFile2 ${fontFileId} 0 R >>`,
  );
  const cidFontId = addObject(
    objects,
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${subset.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorId} 0 R /DW 1000 /W [${widthArray(subset)}] /CIDToGIDMap /Identity >>`,
  );
  const toUnicodeId = addStream(objects, "", Buffer.from(toUnicodeCMap(subset), "ascii"));
  const fontId = addObject(
    objects,
    `<< /Type /Font /Subtype /Type0 /BaseFont /${subset.name} /Encoding /Identity-H /DescendantFonts [${cidFontId} 0 R] /ToUnicode ${toUnicodeId} 0 R >>`,
  );
  const pages = [];
  for (const page of writer.pages) {
    const imageIds = new Map<string, number>();
    const ops: string[] = [];
    for (const op of page.ops) {
      if (op.kind === "text") {
        const glyphs = [...op.text].map((char) => hex4(subset.gidFor.get(char.codePointAt(0) ?? 0) ?? 0)).join("");
        // 变量用略微倾斜的字形矩阵充当斜体（衬线体没有真斜体）
        const matrix = op.italic ? "1 0 0.21 1" : "1 0 0 1";
        ops.push(`BT /F1 ${pdfNumber(op.size)} Tf ${op.color} rg ${matrix} ${pdfNumber(op.x)} ${pdfNumber(op.y)} Tm <${glyphs}> Tj ET`);
      } else if (op.kind === "rect") {
        ops.push(`${op.color} rg ${pdfNumber(op.x)} ${pdfNumber(op.y)} ${pdfNumber(op.width)} ${pdfNumber(op.height)} re f`);
      } else {
        let imageId = imageIds.get(op.name);
        if (!imageId) {
          imageId = addStream(
            objects,
            `/Type /XObject /Subtype /Image /Width ${IMAGE_W} /Height ${IMAGE_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${IMAGE_W} >>`,
            op.bytes,
          );
          imageIds.set(op.name, imageId);
        }
        ops.push(`q ${pdfNumber(op.width)} 0 0 ${pdfNumber(op.height)} ${pdfNumber(op.x)} ${pdfNumber(op.y)} cm /${op.name} Do Q`);
      }
    }
    const contentId = addStream(objects, "", Buffer.from(`${ops.join("\n")}\n`, "ascii"));
    const imageResources = [...imageIds].map(([name, id]) => `/${name} ${id} 0 R`).join(" ");
    pages.push({
      content: contentId,
      resources: `<< /Font << /F1 ${fontId} 0 R >>${imageResources ? ` /XObject << ${imageResources} >>` : ""} >>`,
      width: PAGE_W,
      height: PAGE_H,
    });
  }
  return makePdf(objects, addPages(objects, pages));
}

function answerText(question: Question) {
  if (question.answer == null || !String(question.answer).trim()) return "暂无";
  const answer = String(question.answer).trim();
  const option = question.options?.find((item) => item.id === answer);
  const label = option?.text?.trim() ?? "";
  return label ? `${answer}　${label}` : answer;
}

function writeQuestion(writer: Writer, index: number, question: Question) {
  const label = ({ choice: "选择题", judge: "判断题", fill: "填空题" } as Record<string, string>)[question.type ?? ""] ?? "题目";
  writer.text(`${index}. ${question.id || index}　${label}`, 12, 4, INK);
  writer.text((question.prompt ?? "").trim(), 11, 3);
  for (const option of question.options ?? []) writer.text(`${option.id ?? ""}. ${(option.text ?? "").trim()}`, 11, 2);
  writer.text(`答案：${answerText(question)}`, 11, 3);
  const analysis = (question.analysis ?? "").trim();
  if (analysis) writer.text(`解析：${analysis}`, 10.5, 2, "0.25 0.25 0.23");
  writer.gap(12);
}

function fillQuestions(writer: Writer) {
  writer.text("第六章 题库", 18, 6);
  writer.text("课件章节题，以及受扭、变形、裂缝补充题。", 10.5, 3, "0.35 0.35 0.32");
  writer.gap(8);
  writer.text("一、课件章节题", 14, 4);
  writer.gap(4);
  (questionsJson as Question[]).forEach((question, index) => writeQuestion(writer, index + 1, question));
  writer.gap(6);
  writer.text("二、受扭、变形与裂缝补充题", 14, 4);
  writer.gap(4);
  (extraQuestionsJson as Question[]).forEach((question, index) => writeQuestion(writer, index + 1, question));
}

async function buildQuestions() {
  const font = await loadPdfFont();
  const writer = new Writer(font);
  fillQuestions(writer);
  return renderWriterPdf(writer, font);
}

function cssColor(value: string) {
  const [red, green, blue] = value.split(/\s+/).map((part) => Math.round(Number(part) * 255));
  return `rgb(${red} ${green} ${blue})`;
}

function escapeXml(value: string) {
  const table: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
  return value.replace(/[&<>"']/g, (char) => table[char]);
}

/**
 * 资料下载页要一张「题目 PDF 第一页」的缩略图。
 * 这份 PDF 是纯文字，直接把第一页的文字按同样的位置画成 SVG，比截图轻，改题库也跟着变。
 */
export async function buildQuestionsPreviewSvg() {
  const font = await loadPdfFont();
  const writer = new Writer(font);
  fillQuestions(writer);
  const lines = (writer.pages[0]?.ops ?? [])
    .map((op) => {
      if (op.kind === "text") {
        const slant = op.italic ? ' font-style="italic"' : "";
        return `<text x="${pdfNumber(op.x)}" y="${pdfNumber(PAGE_H - op.y)}" font-size="${pdfNumber(op.size)}" fill="${cssColor(op.color)}"${slant}>${escapeXml(op.text)}</text>`;
      }
      if (op.kind === "rect") {
        return `<rect x="${pdfNumber(op.x)}" y="${pdfNumber(PAGE_H - op.y - op.height)}" width="${pdfNumber(op.width)}" height="${pdfNumber(op.height)}" fill="${cssColor(op.color)}"/>`;
      }
      return "";
    })
    .join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}">`,
    `<rect width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>`,
    `<g font-family="'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',system-ui,sans-serif">${lines}</g>`,
    "</svg>",
  ].join("");
}

async function buildExplain(section: string) {
  const sectionSlides = slides.filter((slide) => slide.section === section);
  if (!sectionSlides.length) throw new Error("没有这一节");
  const font = await loadPdfFont();
  const writer = new Writer(font);
  writer.text(`讲解版 · ${section}`, 17, 5);
  writer.text("课件原图，下面是这一页整理过的重点和要点。", 10, 3, "0.35 0.35 0.32");
  writer.gap(10);
  for (const slide of sectionSlides) {
    const note = notes[String(slide.page)] ?? {};
    // 少数 note 的关键词是没套 $ 的裸 LaTeX，这里补上定界符
    const keys = (note.keys ?? [])
      .map((key) => {
        const trimmed = key.trim();
        return trimmed && !trimmed.includes("$") && trimmed.includes("\\") ? `$${trimmed}$` : trimmed;
      })
      .filter(Boolean);
    const points = (note.points ?? []).map((point) => point.trim()).filter(Boolean);
    // 页标题 + 课件图尽量和要点同页，剩得太少就先翻页
    if (writer.pages.length && writer.remaining() < 470) writer.ensureSpace(PAGE_H);
    writer.ensureSpace(430);
    writer.text(`${section}  ·  第 ${slide.page} 页`, 11.5, 2, "0.34 0.34 0.32");
    writer.gap(2);
    writer.text(note.title?.trim() || slide.title?.trim() || section, 13.5, 4, INK, keys);
    writer.gap(6);
    await writer.image(slide.page, 380);
    writer.gap(12);
    if (keys.length) {
      writer.text(`重点　${keys.join("　")}`, 10.5, 4, INK, keys);
      writer.gap(4);
    }
    if (points.length) {
      for (const point of points) {
        writer.text(`· ${point}`, 10.5, 3, "0.18 0.18 0.17", keys);
        writer.gap(2);
      }
    } else {
      writer.text("这一页没有单独整理的要点。", 10.5, 2, "0.35 0.35 0.32");
    }
    writer.gap(18);
  }
  return renderWriterPdf(writer, font);
}

export async function buildMaterialPdf(kind: "original" | "questions" | "explain", section?: string) {
  if (kind === "original") return buildOriginal();
  if (kind === "questions") return buildQuestions();
  return buildExplain(section ?? "");
}
