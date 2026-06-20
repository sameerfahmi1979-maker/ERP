"use client";

import { Bot, MessageSquare } from "lucide-react";

const EXAMPLE_PROMPTS = [
  "Show me high risk parties",
  "Explain why company #5 is high risk",
  "Find parties named Alliance",
  "What are the open compliance issues for party #12?",
  "Prepare a renewal note for license expiring soon",
  "Open party record #42",
];

interface AssistantEmptyStateProps {
  onPromptClick: (prompt: string) => void;
}

export function AssistantEmptyState({ onPromptClick }: AssistantEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-6">
      <div className="flex items-center justify-center w-14 h-14 bg-violet-100 rounded-full mb-4">
        <Bot className="h-7 w-7 text-violet-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-1">AI Assistant</h3>
      <p className="text-sm text-slate-500 text-center max-w-sm mb-6">
        Ask me to search, explain, or prepare drafts. I will never execute changes automatically — all actions require your explicit approval.
      </p>
      <div className="w-full max-w-sm space-y-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Try asking:</p>
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPromptClick(prompt)}
            className="w-full text-left px-3 py-2 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-violet-300 transition-colors"
          >
            <MessageSquare className="inline h-3.5 w-3.5 mr-1.5 text-violet-400" />
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
