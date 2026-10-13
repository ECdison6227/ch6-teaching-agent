import katex from "katex";

/**
 * 把模型回答里的公式整理成 remark-math / KaTeX 能排的样子。
 *
 * 模型经常把 LaTeX 直接写进中文括号，例如（ q = 2 , \text{kN/m}^2 ），
 * 没有 $...$。这里先把这类片段补上定界符。
 * 已经写好的 $...$ / $$...$$ 继续交给 KaTeX。
 * 流式输出里如果最后一个 $ 还没闭合，只把后面仍像公式的那一截包进去，
 * 不把随后的整段正文吞进公式。
 * ==术语== 只涂在公式外面，不切进公式中间。
 */

const TEXT_CMD =
  "text|textrm|textit|textbf|textsf|texttt|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|mathbb|boldsymbol|operatorname";

const SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  phi: "φ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  times: "×",
  cdot: "·",
  div: "÷",
  pm: "±",
  mp: "∓",
  leq: "≤",
  geq: "≥",
  neq: "≠",
  approx: "≈",
  equiv: "≡",
  infty: "∞",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  partial: "∂",
  nabla: "∇",
  degree: "°",
  circ: "°",
  prime: "′",
};

/** 公式里允许直接出现的函数名，不把它们当成英文单词截断 */
const FUNCS = new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "sinh",
  "cosh",
  "tanh",
  "log",
  "ln",
  "exp",
  "max",
  "min",
  "lim",
  "det",
  "gcd",
  "mod",
  "sup",
  "inf",
  "dim",
  "ker",
  "deg",
  "arg",
]);

type MathTok = { t: "math"; body: string; display: boolean };
type TextTok = { t: "text"; s: string };
type Tok = MathTok | TextTok;

type HastNode = {
  type?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

function isCjk(ch: string): boolean {
  return /[\u3400-\u9fff]/.test(ch);
}

function isCjkPunct(ch: string): boolean {
  return "，。；：、！？（）【】《》「」『』“”‘’…—·".includes(ch);
}

function isMathChar(ch: string): boolean {
  return /[0-9A-Za-z=+\-*/.,:;|<>()[\]!~&%']/.test(ch) || ch === "’" || ch === "′";
}

function skipBrace(text: string, open: number): number {
  if (text[open] !== "{") return open;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
      continue;
    }
    // 花括号没合上就写进正文时，不要把整段话卷进去
    if (depth > 0 && (ch === "\n" || ch === "。" || ch === "！" || ch === "？")) return i;
    if (depth > 0 && i - open > 48 && isCjk(ch)) return i;
  }
  return text.length;
}

function consumeTex(text: string, i: number): number {
  if (text[i] !== "\\") return i;
  const m = /^\\[a-zA-Z]+/.exec(text.slice(i));
  if (!m) return Math.min(text.length, i + 2);
  let j = i + m[0].length;
  if (text[j] === "{") j = skipBrace(text, j);
  return j;
}

function longWordAt(text: string, i: number): boolean {
  if (!/[A-Za-z]/.test(text[i] || "")) return false;
  if (i > 0 && !/\s/.test(text[i - 1])) return false;
  const word = /^[A-Za-z]+/.exec(text.slice(i))?.[0] ?? "";
  return word.length >= 4 && !FUNCS.has(word);
}

function isHighlightEq(text: string, i: number): boolean {
  return text[i] === "=" && (text[i + 1] === "=" || text[i - 1] === "=");
}

/** 从公式起点往后，停在正文开始的地方（中文、句号、未闭合 $ 之前） */
function mathPrefixEnd(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "$") break;
    if (ch === "\\") {
      const next = consumeTex(text, i);
      if (next === i) break;
      i = next;
      continue;
    }
    if (ch === "{") {
      i = skipBrace(text, i);
      continue;
    }
    if (ch === "^" || ch === "_") {
      i += 1;
      if (text[i] === "{") i = skipBrace(text, i);
      else if (text[i] && /[0-9A-Za-z]/.test(text[i])) i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      const nl = ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      const after = text.slice(i + nl);
      const c = /^[ \t]*(\S)/.exec(after)?.[1];
      if (!c || c === "$" || isCjk(c) || isCjkPunct(c) || longWordAt(after.trimStart(), 0)) break;
      if (c === "\\" || c === "{" || c === "^" || c === "_" || isMathChar(c)) {
        i += nl;
        continue;
      }
      break;
    }
    if (ch === " " || ch === "\t") {
      i += 1;
      continue;
    }
    if (isHighlightEq(text, i) || isCjk(ch) || isCjkPunct(ch)) break;
    if (longWordAt(text, i)) break;
    if (isMathChar(ch)) {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

function findClosing(text: string, from: number, display: boolean): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === "\\") {
      i += 1;
      continue;
    }
    if (text[i] !== "$") continue;
    if (display) {
      if (text[i + 1] === "$") return i;
      continue;
    }
    return i;
  }
  return -1;
}

/** 去掉 \text{...} 这类分组后，看定界符中间是不是大段中文 */
function cjkOutsideGroups(inner: string): { cjk: number; sentence: boolean } {
  const stripped = inner.replace(/\\[a-zA-Z]+\s*\{[^{}]*\}/g, " ");
  const cjk = (stripped.match(/[\u3400-\u9fff]/g) || []).length;
  return { cjk, sentence: /[。！？]/.test(stripped) || stripped.includes("\n\n") };
}

function shouldKeepPair(inner: string): boolean {
  const { cjk, sentence } = cjkOutsideGroups(inner);
  if (sentence) return false;
  if (cjk > 8) return false;
  return true;
}

function splitMathRegions(input: string): Tok[] {
  const out: Tok[] = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) out.push({ t: "text", s: buf });
    buf = "";
  };

  while (i < input.length) {
    if (input[i] === "\\" && input[i + 1] === "$") {
      buf += "\\$";
      i += 2;
      continue;
    }
    if (input[i] !== "$") {
      buf += input[i];
      i += 1;
      continue;
    }

    let j = i;
    while (input[j] === "$") j += 1;
    const marker = j - i;
    const display = marker >= 2;
    const from = display ? i + 2 : i + 1;
    const close = findClosing(input, from, display);
    const inner = close >= 0 ? input.slice(from, close) : null;

    if (inner != null && shouldKeepPair(inner)) {
      flush();
      out.push({ t: "math", body: inner, display });
      i = close + (display ? 2 : 1);
      continue;
    }

    const end = mathPrefixEnd(input, from);
    const raw = input.slice(from, end);
    const body = raw.trim();
    flush();
    if (body) {
      out.push({ t: "math", body, display });
      i = from + raw.trimEnd().length;
    } else {
      buf += display ? "\\$\\$" : "\\$";
      i = from;
    }
  }
  flush();
  return out;
}

function expandLeft(text: string, from: number): number {
  let i = from;
  while (i > 0) {
    const ch = text[i - 1];
    if (ch === "}") {
      let depth = 0;
      let k = i - 1;
      let open = -1;
      for (; k >= 0; k--) {
        if (text[k] === "}") depth += 1;
        else if (text[k] === "{") {
          depth -= 1;
          if (depth === 0) {
            open = k;
            break;
          }
        }
      }
      if (open < 0) break;
      i = open;
      const cmd = /\\[a-zA-Z]+$/.exec(text.slice(0, i));
      if (cmd) i -= cmd[0].length;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i -= 1;
      continue;
    }
    if (ch === "\\") {
      i -= 1;
      continue;
    }
    if (isHighlightEq(text, i - 1) || isCjk(ch) || isCjkPunct(ch)) break;
    if (/[A-Za-z]/.test(ch)) {
      let k = i - 1;
      while (k > 0 && /[A-Za-z]/.test(text[k - 1])) k -= 1;
      const word = text.slice(k, i);
      if (word.length >= 4 && !FUNCS.has(word) && (k === 0 || /\s/.test(text[k - 1]))) break;
      i -= 1;
      continue;
    }
    if (isMathChar(ch) || ch === "{" || ch === "^" || ch === "_") {
      i -= 1;
      continue;
    }
    break;
  }
  while (i < from && /\s/.test(text[i])) i += 1;
  return i;
}

function expandRight(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      const next = consumeTex(text, i);
      if (next === i) break;
      i = next;
      continue;
    }
    if (ch === "{") {
      i = skipBrace(text, i);
      continue;
    }
    if (ch === "^" || ch === "_") {
      i += 1;
      if (text[i] === "{") i = skipBrace(text, i);
      else if (text[i] && /[0-9A-Za-z]/.test(text[i])) i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      const nl = ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      const after = text.slice(i + nl);
      const c = /^[ \t]*(\S)/.exec(after)?.[1];
      if (!c || isCjk(c) || isCjkPunct(c) || c === "$" || longWordAt(after.trimStart(), 0)) break;
      if (c === "\\" || c === "{" || c === "^" || c === "_" || isMathChar(c)) {
        i += nl;
        continue;
      }
      break;
    }
    if (ch === " " || ch === "\t") {
      i += 1;
      continue;
    }
    if (isHighlightEq(text, i) || isCjk(ch) || isCjkPunct(ch) || longWordAt(text, i)) break;
    if (isMathChar(ch)) {
      i += 1;
      continue;
    }
    break;
  }
  while (i > from && /\s/.test(text[i - 1])) i -= 1;
  return i;
}

function wrapBareLatex(segment: string): string {
  let out = "";
  let i = 0;
  while (i < segment.length) {
    const m = /\\([a-zA-Z]{2,})/.exec(segment.slice(i));
    if (!m) {
      out += segment.slice(i);
      break;
    }
    const cmdStart = i + m.index;
    const cmdEnd = cmdStart + m[0].length;
    let start = expandLeft(segment, cmdStart);
    const end = expandRight(segment, cmdEnd);
    if (start < i) start = i;
    if (end <= start) {
      i = cmdEnd;
      continue;
    }
    out += segment.slice(i, start);
    out += finalize(segment.slice(start, end), false);
    i = end;
  }
  return out;
}

function soften(src: string): string {
  let s = src.replace(/\r\n/g, "\n");
  if (!/\\begin\b/.test(s)) s = s.replace(/[ \t]*\n[ \t]*/g, " ");
  return s.replace(/[ \t]{2,}/g, " ").trim();
}

/** 把 \text{kN/m^2} 里的上下标挪到花括号外，并收掉多余空格 */
function repairLatex(src: string): string {
  let s = soften(src);
  s = s.replace(/\\([a-zA-Z]+)\s+\{/g, "\\$1{");
  s = s.replace(/\s*([_^])\s*/g, "$1");
  s = s.replace(
    new RegExp(`\\\\(${TEXT_CMD})\\{([^{}]*)\\}`, "g"),
    (_full, cmd: string, inner: string) => {
      const scripts: string[] = [];
      const cleaned = inner
        .replace(/([_^])\s*(\{[^{}]*\}|[0-9A-Za-z]+)/g, (_m, op: string, arg: string) => {
          scripts.push(op + (arg.startsWith("{") ? arg : `{${arg}}`));
          return "";
        })
        .replace(/\s+/g, " ")
        .trim();
      return `\\${cmd}{${cleaned}}${scripts.join("")}`;
    },
  );
  s = s.replace(/([_^])([0-9A-Za-z])/g, "$1{$2}");
  s = s.replace(/\s+,/g, ",");
  s = s.replace(/,\s+/g, ", ");
  s = balanceBraces(s);
  s = s.replace(/[_^](?=$|[^\\{0-9A-Za-z])/g, "");
  const lefts = (s.match(/\\left\b/g) || []).length;
  const rights = (s.match(/\\right\b/g) || []).length;
  if (lefts !== rights) s = s.replace(/\\(?:left|right)\b/g, "");
  return s.trim();
}

function balanceBraces(s: string): string {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\") {
      i += 1;
      continue;
    }
    if (s[i] === "{") depth += 1;
    else if (s[i] === "}") depth = Math.max(0, depth - 1);
  }
  return depth > 0 ? s + "}".repeat(depth) : s;
}

function katexOk(src: string, display: boolean): boolean {
  if (!src.trim() || src.length > 2000) return false;
  try {
    katex.renderToString(src, { throwOnError: true, displayMode: display, strict: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function pickRenderable(body: string, display: boolean): string | null {
  const softened = soften(body).replace(/\$/g, "");
  const repaired = repairLatex(body).replace(/\$/g, "");
  const candidates = [
    softened,
    repaired,
    repaired.replace(/\\text\b/g, "\\mathrm"),
    repaired.replace(/\s+/g, ""),
  ];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    if (katexOk(c, display)) return c;
  }
  return null;
}

/** KaTeX 修不好时，去掉反斜杠，留下还能读的字 */
export function demoteLatex(src: string): string {
  let s = src.replace(/\\\\/g, " ");
  for (let n = 0; n < 8; n++) {
    const next = s
      .replace(new RegExp(`\\\\(?:${TEXT_CMD})\\s*\\{([^{}]*)\\}`, "g"), "$1")
      .replace(/\\(?:frac|dfrac|tfrac|cfrac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1/$2")
      .replace(/\\sqrt\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g, "√$1")
      .replace(/\\left\b|\\right\b/g, "")
      .replace(/\\([a-zA-Z]+)\s*/g, (_m, name: string) => SYMBOLS[name] ?? "");
    if (next === s) break;
    s = next;
  }
  s = s.replace(/[{}]/g, "");
  s = s.replace(/\\(.)/g, "$1");
  s = s.replace(/[ \t]*\n[ \t]*/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\^\{\s*2\s*\}|\^2/g, "²");
  s = s.replace(/\^\{\s*3\s*\}|\^3/g, "³");
  s = s.replace(/\s*,\s*/g, ", ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/</g, "＜").replace(/>/g, "＞");
  return s;
}

function finalize(body: string, display: boolean): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  const chosen = pickRenderable(trimmed, display);
  if (chosen) {
    return display ? `\n$$\n${chosen}\n$$\n` : `$${chosen}$`;
  }
  return demoteLatex(trimmed);
}

function maskCode(text: string): { text: string; blocks: string[] } {
  const blocks: string[] = [];
  const put = (s: string) => {
    const token = `\uE002${blocks.length}=\uE003`;
    blocks.push(s);
    return token;
  };
  let t = text.replace(/```[\s\S]*?```/g, (m) => put(m));
  t = t.replace(/`[^`\n]*`/g, (m) => put(m));
  return { text: t, blocks };
}

function unmask(text: string, blocks: string[]): string {
  return text.replace(/\uE002(\d+)=\uE003/g, (_m, n: string) => blocks[Number(n)] ?? "");
}

function wrapMark(s: string): string {
  const lead = /^\s*/.exec(s)?.[0] ?? "";
  const trail = /\s*$/.exec(s)?.[0] ?? "";
  if (!s.trim()) return s;
  let core = s.slice(lead.length, s.length - trail.length);
  let pre = "";
  let post = "";
  const open = (ch: string) => ch === "（" || ch === "(";
  const close = (ch: string) => ch === "）" || ch === ")";
  while (core && open(core[0])) {
    pre += core[0];
    core = core.slice(1);
  }
  while (core && close(core[core.length - 1])) {
    post = core[core.length - 1] + post;
    core = core.slice(0, -1);
  }
  // 括号贴着公式时留在高亮外面，避免黄底切进公式
  while (core && open(core[core.length - 1])) {
    post = core[core.length - 1] + post;
    core = core.slice(0, -1);
  }
  while (core && close(core[0])) {
    pre += core[0];
    core = core.slice(1);
  }
  if (!core.trim()) return s;
  return `${lead}${pre}**${core}**${post}${trail}`;
}

/** 把已经定界的公式换成占位，避免 ==高亮== 的匹配穿进 $...$ */
function maskMathSpans(text: string): { text: string; slots: string[] } {
  const slots: string[] = [];
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\" && text[i + 1] === "$") {
      out += "\\$";
      i += 2;
      continue;
    }
    if (text[i] !== "$") {
      out += text[i];
      i += 1;
      continue;
    }
    const display = text[i + 1] === "$";
    const from = i + (display ? 2 : 1);
    const close = findClosing(text, from, display);
    if (close < 0) {
      out += text[i];
      i += 1;
      continue;
    }
    const end = close + (display ? 2 : 1);
    const token = `\uE000${slots.length}=\uE001`;
    slots.push(text.slice(i, end));
    out += token;
    i = end;
  }
  return { text: out, slots };
}

/** ==术语== 涂黄。公式占位里含 =，高亮不会穿进公式。 */
function applyHighlight(text: string): string {
  const maskedMath = maskMathSpans(text);
  const slots = maskedMath.slots;
  const masked = maskedMath.text;

  let out = "";
  let i = 0;
  while (i < masked.length) {
    const open = masked.indexOf("==", i);
    if (open < 0) {
      out += masked.slice(i);
      break;
    }
    out += masked.slice(i, open);
    const close = findHighlightClose(masked, open + 2);
    if (close < 0) {
      out += "==";
      i = open + 2;
      continue;
    }
    const inner = masked.slice(open + 2, close);
    if (inner.includes("\uE002")) {
      out += `==${inner}==`;
      i = close + 2;
      continue;
    }
    out += highlightPieces(inner);
    i = close + 2;
  }
  return out.replace(/\uE000(\d+)=\uE001/g, (_m, n: string) => slots[Number(n)] ?? "");
}

function findHighlightClose(s: string, from: number): number {
  let n = 0;
  let i = from;
  while (i < s.length && n <= 80) {
    if (s.startsWith("==", i)) return i;
    if (s[i] === "\n") return -1;
    if (s[i] === "\uE000" || s[i] === "\uE002") {
      const endCh = s[i] === "\uE000" ? "\uE001" : "\uE003";
      const end = s.indexOf(endCh, i + 1);
      if (end < 0) return -1;
      i = end + 1;
      n += 1;
      continue;
    }
    if (s[i] === "=") return -1;
    i += 1;
    n += 1;
  }
  return -1;
}

function highlightPieces(inner: string): string {
  const re = /\uE000\d+=\uE001/g;
  let out = "";
  let last = 0;
  for (const m of inner.matchAll(re)) {
    const idx = m.index ?? 0;
    out += wrapMark(inner.slice(last, idx));
    out += m[0];
    last = idx + m[0].length;
  }
  out += wrapMark(inner.slice(last));
  return out;
}

function textOf(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function isKatexError(node: HastNode): boolean {
  const cls = node.properties?.className;
  const list = Array.isArray(cls) ? cls.map(String) : typeof cls === "string" ? cls.split(/\s+/) : [];
  return list.includes("katex-error");
}

/** KaTeX 仍失败时，用可读文字换掉红色源码，避免整段空白或把反斜杠甩给学生 */
export function rehypeDemoteKatexErrors() {
  return (tree: HastNode) => {
    const visit = (node: HastNode) => {
      const kids = node.children;
      if (!kids) return;
      for (let i = 0; i < kids.length; i++) {
        const child = kids[i];
        if (child.type === "element" && isKatexError(child)) {
          kids[i] = { type: "text", value: demoteLatex(textOf(child)) };
        } else {
          visit(child);
        }
      }
    };
    visit(tree);
  };
}

export function prepareMathMarkdown(text: string): string {
  if (!text) return "";
  let t = text;
  const fence = t.search(/```(card|diagram|slide|verdict)/);
  if (fence >= 0) t = t.slice(0, fence);
  const masked = maskCode(t);
  let out = "";
  for (const tok of splitMathRegions(masked.text)) {
    out += tok.t === "math" ? finalize(tok.body, tok.display) : wrapBareLatex(tok.s);
  }
  return unmask(applyHighlight(out), masked.blocks);
}
