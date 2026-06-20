"use client";

import { Bot } from "lucide-react";

export function AssistantLoading() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center">
        <Bot className="h-4 w-4 text-violet-600" />
      </div>
      <div className="flex-1 pt-1">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
          <div className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
          <div className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
