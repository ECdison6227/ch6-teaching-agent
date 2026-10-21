"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { appPath } from "@/lib/app-path";
import { copyText } from "@/lib/clipboard";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { prepareMathMarkdown, rehypeDemoteKatexErrors } from "@/lib/math-markdown";

function nodeText(node: ReactNode): string { return Children.toArray(node).map(child => typeof child === "string" || typeof child === "number" ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? nodeText(child.props.children) : "").join(""); }

/** 老师用 ==术语== 标出的重点，在句子里涂黄，不另起一行。公式走 KaTeX。 */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  return (
    <div className={`md-body ${className}`}>
      <ReactMarkdown
        /**
         * singleTilde:false 关掉 GFM 的「单个波浪号」删除线。
         * 页码索引按「第 64~75 页」这种格式给模型，模型会照抄进正文；
         * 开着单波浪号时，「第17~46页…第47~63页」中间的正文会被整段划掉、
         * 两端波浪号也被吃掉。现在只有 ~~ 才会渲染删除线。
         */
        remarkPlugins={[remarkMath, [remarkGfm, { singleTilde: false }]]}
        rehypePlugins={[
          [rehypeKatex, { throwOnError: false, strict: false, output: "html" }],
          rehypeDemoteKatexErrors,
        ]}
        components={{
          pre: ({ children }) => { const code = nodeText(children); return <Card className="markdown-container my-4 overflow-hidden rounded-xl border-0 shadow-none"><div className="markdown-header-content"><span className="text-xs text-muted-foreground">代码</span><Button variant="ghost" size="sm" aria-label="复制代码" className="h-7 px-2 text-xs" onClick={() => { void copyText(code).then(ok => { setCopiedCode(ok ? code : null); setCopyStatus(ok ? "已复制代码" : "复制失败，请选中代码后复制。"); }); }}><span className="kimi-source-icon" style={{ maskImage: `url(${appPath("/design/kimi-web/copy.svg")})` }} aria-hidden />{copiedCode === code ? "已复制" : "复制"}</Button></div><pre>{children}</pre><span className="sr-only" role="status">{copyStatus}</span></Card>; },
          a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          strong: ({ children }) => <mark className="hl-key">{children}</mark>,
        }}
      >
        {prepareMathMarkdown(text)}
      </ReactMarkdown>
    </div>
  );
}
