"use client";

import { useRef } from "react";
import { ArrowUp, GraduationCap, ImagePlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ChatModelOption } from "@/lib/models/options";

function ModelIcon({ provider }: { provider?: ChatModelOption["provider"] }) {
  const Icon = provider === "school" ? GraduationCap : Sparkles;
  return <Icon className="size-3.5 shrink-0 text-ink-soft" aria-hidden />;
}

export function Composer({
  value,
  onChange,
  onSend,
  onImage,
  blocked,
  busy,
  pendingImages = [],
  onRemoveImage,
  quote,
  onClearQuote,
  models = [],
  modelId = null,
  onModelChange,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onImage: (file: File) => void;
  blocked: boolean;
  busy: boolean;
  pendingImages?: string[];
  onRemoveImage?: (index: number) => void;
  quote?: string | null;
  onClearQuote?: () => void;
  models?: ChatModelOption[];
  modelId?: string | null;
  onModelChange?: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canSend = !blocked && !busy && (!!value.trim() || pendingImages.length > 0 || !!quote);
  const selected = models.find((m) => m.id === modelId) ?? null;

  const takeImages = (files: File[]) => {
    for (const f of files) {
      if (f.type.startsWith("image/")) onImage(f);
    }
  };

  return (
    <div className="bg-background px-4 pt-2 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] sm:px-8 sm:pb-8">
      <div className="mx-auto max-w-chat">
        {quote ? (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-paper-line bg-paper px-3 py-2">
            <span className="mt-0.5 shrink-0 rounded bg-ink px-1.5 py-0.5 text-[11px] text-paper">追问</span>
            <span className="line-clamp-2 flex-1 text-[12px] leading-5 text-ink-soft">{quote}</span>
            <button
              type="button"
              onClick={onClearQuote}
              className="-my-1 -mr-1 shrink-0 rounded-md px-2 py-1 text-[12px] text-ink-faint hover:text-ink"
            >
              取消
            </button>
          </div>
        ) : null}

        {pendingImages.length ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {pendingImages.map((src, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-14 w-14 rounded-lg object-cover ring-1 ring-paper-line" />
                <button
                  type="button"
                  onClick={() => onRemoveImage?.(i)}
                  title="移除这张图片"
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-paper-line bg-paper text-[11px] leading-none text-ink-faint hover:text-ink"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-1 rounded-3xl border bg-card px-2 py-2 shadow-sm">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileRef.current?.click()}
            disabled={blocked || busy}
            title="上传或粘贴图片"
            className="shrink-0"
          >
            <ImagePlus />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              takeImages([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={(e) => {
              const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
              if (!files.length) return;
              e.preventDefault();
              takeImages(files);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
            rows={1}
            disabled={blocked || busy}
            placeholder={blocked ? "先回答上面的卡片，才能继续" : ""}
            className="max-h-40 min-h-[36px] min-w-0 flex-1 resize-none bg-transparent text-[14px] leading-7 outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
          />
          <Select
            value={selected ? selected.id : undefined}
            onValueChange={(id) => onModelChange?.(id)}
            disabled={models.length === 0}
          >
            <SelectTrigger
              aria-label="选择模型"
              title={selected?.label || "选择模型"}
              className="h-9 w-max min-w-0 max-w-[calc(100%-6.25rem)] shrink justify-start gap-1 overflow-hidden border-0 bg-transparent px-0 pl-1.5 pr-0 text-[12px] shadow-none focus:ring-0 [&>span]:min-w-0 [&>span]:truncate [&>svg]:shrink-0"
            >
              <SelectValue placeholder="模型" />
            </SelectTrigger>
            <SelectContent side="top" align="end" className="z-[60]">
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id} textValue={m.label}>
                  <span className="flex items-center gap-1.5">
                    <ModelIcon provider={m.provider} />
                    {m.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="icon" className="shrink-0 rounded-full" onClick={onSend} disabled={!canSend}>
            <ArrowUp />
          </Button>
        </div>

        {blocked ? (
          <div className="mt-2 h-4 text-center text-[11px] text-ink-faint">先回答上面的卡片，才能继续</div>
        ) : null}
      </div>
    </div>
  );
}
