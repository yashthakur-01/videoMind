"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({
  minHeight,
  maxHeight,
}: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;

      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
      );

      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = `${minHeight}px`;
    }
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

interface AIPromptProps {
  onSubmit: (message: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function AIPrompt({
  onSubmit,
  disabled = false,
  placeholder = "Ask about this video",
  className,
}: AIPromptProps) {
  const [value, setValue] = useState("");
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 56,
    maxHeight: 220,
  });

  const submit = async () => {
    const trimmedValue = value.trim();
    if (!trimmedValue || disabled) return;

    await onSubmit(trimmedValue);
    setValue("");
    adjustHeight(true);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await submit();
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/80 p-1.5">
        <div className="relative flex items-end gap-2 rounded-xl bg-black/20 p-2">
          <Textarea
            id="ai-chat-input"
            value={value}
            placeholder={placeholder}
            className={cn(
              "w-full resize-none border-none bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0",
              "min-h-[56px]"
            )}
            ref={textareaRef}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            onChange={(e) => {
              setValue(e.target.value);
              adjustHeight();
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "rounded-lg bg-zinc-100 text-zinc-900 hover:bg-white disabled:opacity-40",
              "h-9 w-9"
            )}
            aria-label="Send message"
            disabled={disabled || !value.trim()}
            onClick={() => {
              void submit();
            }}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
