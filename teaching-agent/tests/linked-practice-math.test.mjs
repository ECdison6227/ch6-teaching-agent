import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { prepareMathMarkdown, rehypeDemoteKatexErrors } from "../src/lib/math-markdown.ts";
import { formatLinkedText } from "../src/features/linked-practice/text.ts";
import { getLinkedCatalog } from "../src/features/linked-practice/model.ts";

test("旧Word撇号通过现有公式组件显示，保留已定界公式与原始答案", () => {
  const raw = "此时不能取 σ's = f'y，而应按 σ’s = Es·ε’s 计算实际应力。";
  const text = formatLinkedText(raw);
  const html = renderToStaticMarkup(React.createElement(ReactMarkdown, {
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeKatex, { throwOnError: false, strict: false, output: "html" }], rehypeDemoteKatexErrors],
    children: prepareMathMarkdown(text),
  }));
  const visible = html.replace(/<[^>]+>/g, "");
  assert.ok(html.includes("katex"));
  assert.ok(!visible.includes("$"), visible);
  assert.ok(!html.includes("katex-error"));
  assert.equal(formatLinkedText("$\\sigma'_s=f'_y$"), "$\\sigma'_s=f'_y$");
  assert.equal(formatLinkedText("x ≥ 2a’；As=1256 mm²"), "x ≥ 2a’；As=1256 mm²");
  const question = getLinkedCatalog().find(question => question.sourceAlias === "P-027");
  const original = question.analysis;
  formatLinkedText(original);
  assert.equal(question.analysis, original);
});

test("前置基础解析中的撇号和比较符不露出数学定界符", () => {
  const question = getLinkedCatalog().find(question => question.sourceAlias === "T-108");
  const html = renderToStaticMarkup(React.createElement(ReactMarkdown, {
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeKatex, { throwOnError: false, strict: false, output: "html" }], rehypeDemoteKatexErrors],
    children: prepareMathMarkdown(formatLinkedText(question.analysis)),
  }));
  const visible = html.replace(/<[^>]+>/g, "");
  assert.ok(!visible.includes("$"), visible);
  assert.ok(!html.includes("katex-error"));
  assert.ok(visible.includes("&lt;") || visible.includes("<"), visible);
});
