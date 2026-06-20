"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ASSISTANT_MAX_USER_MESSAGE_LENGTH as MAX_USER_MESSAGE_LENGTH } from "@/lib/ai/common/assistant";

interface AssistantChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function AssistantChatInput({ onSend, isLoading, disabled }: AssistantChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [value]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const remaining = MAX_USER_MESSAGE_LENGTH - value.length;
  const isOverLimit = remaining < 0;

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, MAX_USER_MESSAGE_LENGTH + 50))}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to search, explain, or prepare a draft…"
            rows={1}
            disabled={isLoading || disabled}
            className="resize-none min-h-[40px] max-h-[150px] py-2 pr-3 text-sm bg-slate-50 border-slate-200 focus:ring-violet-500"
          />
          {value.length > MAX_USER_MESSAGE_LENGTH * 0.8 && (
            <span
              className={`absolute bottom-1.5 right-2 text-[10px] ${isOverLimit ? "text-red-500 font-medium" : "text-slate-400"}`}
            >
              {remaining}
            </span>
          )}
        </div>
        <Button
          type="button"
          onClick={handleSend}
          disabled={!value.trim() || isLoading || disabled || isOverLimit}
          size="sm"
          className="h-9 px-3 bg-violet-600 hover:bg-violet-700 flex-shrink-0"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5 px-0.5">
        Press Enter to send · Shift+Enter for new line · Assistant cannot execute changes automatically
      </p>
    </div>
  );
}
