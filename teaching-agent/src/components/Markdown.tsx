"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { prepareMathMarkdown, rehypeDemoteKatexErrors } from "@/lib/math-markdown";

/** 老师用 ==术语== 标出的重点，在句子里涂黄，不另起一行。公式走 KaTeX。 */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`md-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[
          [rehypeKatex, { throwOnError: false, strict: false, output: "html" }],
          rehypeDemoteKatexErrors,
        ]}
        components={{
          a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          strong: ({ children }) => <mark className="hl-key">{children}</mark>,
        }}
      >
        {prepareMathMarkdown(text)}
      </ReactMarkdown>
    </div>
  );
}
