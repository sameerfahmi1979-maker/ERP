"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Loader2, Lock, AlertCircle, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { askDmsDocumentQuestion } from "@/server/actions/dms/document-qa";
import type { DmsDocumentQuestionAnswer } from "@/lib/dms/ai/types";

interface DmsDocumentAskAiSectionProps {
  documentId: number | null;
  confidentialityLevel: string | null;
  isAdmin: boolean;
}

const CONFIDENTIAL_ADMIN_REQUIRED = ["hr", "legal", "executive"];

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const SOURCE_LABELS: Record<string, string> = {
  content_text: "Extracted Text",
  ai_summary: "AI Summary",
  metadata: "Document Metadata",
  not_found: "Not Found",
  chunk_text: "Semantic Chunks",
};

type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; answer: DmsDocumentQuestionAnswer }
  | { role: "error"; content: string };

export function DmsDocumentAskAiSection({
  documentId,
  confidentialityLevel,
  isAdmin,
}: DmsDocumentAskAiSectionProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const threadRef = useRef<HTMLDivElement>(null);

  const isConfidential = CONFIDENTIAL_ADMIN_REQUIRED.includes(confidentialityLevel ?? "");
  const isBlocked = isConfidential && !isAdmin;

  // Auto-scroll the thread to the latest message
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleAsk() {
    const trimmed = question.trim();
    if (!documentId || !trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setQuestion("");
    setLoading(true);
    try {
      const result = await askDmsDocumentQuestion(documentId, trimmed);
      if (result.success && result.data) {
        setMessages((prev) => [...prev, { role: "assistant", answer: result.data! }]);
      } else {
        setMessages((prev) => [...prev, { role: "error", content: result.error ?? "Ask AI failed." }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "error", content: "Ask AI failed. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!documentId) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        Save the document first to use Ask AI.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-340px)] min-h-[320px]">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 shrink-0">
        <Sparkles className="h-4 w-4 text-purple-500" />
        <h3 className="text-sm font-semibold">Ask AI About This Document</h3>
      </div>

      {isBlocked ? (
        <div className="rounded-md border border-amber-200/60 bg-amber-50/50 dark:bg-amber-950/10 p-4 flex items-start gap-3">
          <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-400">
            Ask AI is restricted for{" "}
            <span className="font-medium capitalize">{confidentialityLevel}</span> documents.
            Contact a DMS administrator.
          </div>
        </div>
      ) : (
        <>
          {/* Conversation thread (top, scrollable) */}
          <div
            ref={threadRef}
            className="flex-1 min-h-0 overflow-y-auto space-y-4 rounded-md border border-border bg-muted/10 p-4"
          >
            {messages.length === 0 && !loading ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-2 py-8">
                <Bot className="h-8 w-8 opacity-40" />
                <p className="text-sm">Ask anything about this document.</p>
                <p className="text-xs max-w-xs">
                  e.g. &quot;What is the expiry date?&quot; or &quot;Who is the primary person
                  mentioned?&quot;
                </p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                if (msg.role === "user") {
                  return (
                    <div key={idx} className="flex justify-end">
                      <div className="flex items-start gap-2 max-w-[85%] flex-row-reverse">
                        <div className="h-7 w-7 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                }
                if (msg.role === "error") {
                  return (
                    <div key={idx} className="flex justify-start">
                      <div className="flex items-start gap-2 max-w-[85%]">
                        <div className="h-7 w-7 shrink-0 rounded-full bg-destructive/10 flex items-center justify-center">
                          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                        </div>
                        <div className="rounded-2xl rounded-tl-sm border border-destructive/30 bg-destructive/5 px-3.5 py-2 text-sm text-destructive">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                }
                // assistant
                return (
                  <div key={idx} className="flex justify-start">
                    <div className="flex items-start gap-2 max-w-[85%]">
                      <div className="h-7 w-7 shrink-0 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                      </div>
                      <div className="rounded-2xl rounded-tl-sm border border-border bg-background px-3.5 py-2.5 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${CONFIDENCE_COLORS[msg.answer.confidence] ?? ""}`}
                          >
                            {msg.answer.confidence} confidence
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 text-muted-foreground"
                          >
                            {SOURCE_LABELS[msg.answer.sourceUsed] ?? msg.answer.sourceUsed}
                          </Badge>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {msg.answer.answer}
                        </p>
                        {msg.answer.chunkCitations && msg.answer.chunkCitations.length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-border/60">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                              Chunk citations
                            </p>
                            {msg.answer.chunkCitations.map((citation) => (
                              <p
                                key={citation.chunkIndex}
                                className="text-[11px] text-muted-foreground line-clamp-2"
                              >
                                <span className="font-mono text-purple-600 dark:text-purple-400">
                                  #{citation.chunkIndex}
                                </span>
                                {" — "}
                                {citation.snippet}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-start gap-2">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-border bg-background px-3.5 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking…
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Composer (bottom) */}
          <div className="shrink-0 pt-3 space-y-2">
            <div className="relative">
              <Textarea
                placeholder="Ask a question — Enter to send, Shift+Enter for a new line"
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, 500))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAsk();
                  }
                }}
                rows={2}
                className="text-sm resize-none pr-12"
              />
              <Button
                size="icon"
                onClick={handleAsk}
                disabled={loading || !question.trim()}
                className="absolute bottom-2 right-2 h-8 w-8"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Answers come only from this document&apos;s extracted text, AI summary, and metadata.
              </span>
              <span className="text-[10px] text-muted-foreground">{question.length}/500</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
