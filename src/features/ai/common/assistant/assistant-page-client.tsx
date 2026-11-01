"use client";
import { toast } from "sonner";

import type { AssistantDraftRow, AssistantMessageRow, AssistantSessionRow } from "@/lib/ai/common/assistant/types";
import {
  getAssistantSession,
  getAssistantSessions,
  sendAssistantMessage,
  startAssistantSession
} from "@/server/actions/ai/common/assistant";
import { ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReadCacheOwner, type ReadCacheIdentity } from "@/components/layout/read-cache-boundary";
import { AssistantActionChips } from "./assistant-action-chips";
import { AssistantChatInput } from "./assistant-chat-input";
import { AssistantEmptyState } from "./assistant-empty-state";
import { AssistantLoading } from "./assistant-loading";
import { AssistantMessageBubble } from "./assistant-message-bubble";
import { AssistantSessionList } from "./assistant-session-list";

interface PendingMessageExtra {
  navigationLinks?: Array<{ label: string; route: string }>;
  searchResultSummary?: Array<{ title: string; subtitle?: string | null; route: string; resultType: string }>;
  draftIds?: number[];
}

interface MessageWithExtras extends AssistantMessageRow {
  extras?: PendingMessageExtra;
}

interface AssistantPageClientProps {
  initialIdentity?: ReadCacheIdentity | null;
  initialSessions: AssistantSessionRow[];
  initialEntityType?: string;
  initialEntityId?: number;
}

export function AssistantPageClient(props: AssistantPageClientProps) {
  const owner = useReadCacheOwner();
  return <AssistantPageSession key={JSON.stringify([owner?.identity, owner?.generation, owner?.isLive()])} {...props} initialSessions={owner?.admits(props.initialIdentity) ? props.initialSessions : []} />;
}
function AssistantPageSession({
  initialSessions,
  initialEntityType,
  initialEntityId,
}: AssistantPageClientProps) {
  const preferredSession = initialEntityType && initialEntityId ? initialSessions.find(s => s.contextEntityType === initialEntityType && s.contextEntityId === initialEntityId)?.id ?? null : initialSessions[0]?.id ?? null;
  const owner = useReadCacheOwner(), epoch = useRef(0), selectedSession = useRef<number | null>(preferredSession), sendLease = useRef(0);
  const live = () => owner?.isLive() === true;
  const [notice, setNotice] = useState<string | null>(null), [uncertain, setUncertain] = useState(false);
  useEffect(() => () => { epoch.current++; }, []);
  const [sessions, setSessions] = useState<AssistantSessionRow[]>(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(
    preferredSession
  );
  const [messages, setMessages] = useState<MessageWithExtras[]>([]);
  const [drafts, setDrafts] = useState<AssistantDraftRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Load session on selection
  const loadSession = useCallback(async (sessionId: number) => {
    const ticket = epoch.current;
    const result = await getAssistantSession(sessionId);
    if (ticket !== epoch.current || !owner?.isLive() || selectedSession.current !== sessionId) return;
    if (result.success && result.data) {
      setMessages(result.data.messages as MessageWithExtras[]);
      setDrafts(result.data.drafts);
      setUncertain(false); setNotice(null);
    } else {
      setMessages([]); setDrafts([]); setNotice(result.error ?? "Session access could not be verified.");
    }
  }, [owner]);

  useEffect(() => {
    if (!activeSessionId) return;
    selectedSession.current = activeSessionId;
    const ticket = ++epoch.current;
    let cancelled = false;
    getAssistantSession(activeSessionId).then(result => {
      if (!cancelled && ticket === epoch.current && owner?.isLive() && result.success && result.data) {
        setMessages(result.data.messages as MessageWithExtras[]);
        setDrafts(result.data.drafts);
      }
    }).catch(() => { if (!cancelled) toast.error("Failed to load session"); });
    return () => { cancelled = true; };
  }, [activeSessionId, owner]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Refresh sessions list
  const refreshSessions = useCallback(async () => {
    const result = await getAssistantSessions({ limit: 20 });
    if (owner?.isLive() && result.success && result.data) {
      setSessions(result.data);
    }
  }, [owner]);

  const handleNewSession = async () => {
    if (!live() || isCreating || isLoading) return;
    const ticket = ++epoch.current;
    setIsCreating(true);
    let result;
    try { result = await startAssistantSession({ contextEntityType: initialEntityType, contextEntityId: initialEntityId }); }
    catch { if (ticket === epoch.current && live()) { setIsCreating(false); setNotice("Session creation is unconfirmed. Reload the session list before creating another."); } return; }
    if (ticket !== epoch.current || !live()) return;
    setIsCreating(false);

    if (result.success && result.data) {
      setSessions((prev) => [result.data!, ...prev]);
      setActiveSessionId(result.data.id);
      selectedSession.current = result.data.id; setNotice(null); setUncertain(false);
      setMessages([]);
      setDrafts([]);
    }
  };

  const handleSelectSession = (session: AssistantSessionRow) => {
    epoch.current++; selectedSession.current = session.id;
    sendLease.current = 0;
    setMessages([]); setDrafts([]); setNotice(null); setIsLoading(false); setIsCreating(false); setUncertain(false);
    setActiveSessionId(session.id);
  };

  const handleSend = async (userMessage: string, explicitSessionId?: number) => {
    const sid = explicitSessionId ?? selectedSession.current;
    if (!sid || isLoading || sendLease.current || uncertain || !live()) return;
    const ticket = ++epoch.current;
    sendLease.current = ticket;

    setIsLoading(true);

    // Optimistically add user message
    const tempUserMsg: MessageWithExtras = {
      id: Date.now(),
      sessionId: sid,
      role: "user",
      messageText: userMessage,
      outputType: "text",
      safeMetadataJson: {},
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    let result;
    try { result = await sendAssistantMessage({ sessionId: sid, userMessage, requestId:crypto.randomUUID() }); }
    catch { if (ticket === epoch.current && live() && selectedSession.current === sid) { sendLease.current = 0; setIsLoading(false); setUncertain(true); setNotice("The response or conversation save is unconfirmed. Reload this session before retrying; do not automatically repeat processing."); } return; }
    if (ticket !== epoch.current || !live() || selectedSession.current !== sid) return;
    sendLease.current = 0;
    setIsLoading(false);

    if (result.success && result.data) {
      // Display the freshly authorised turn. Composite historical answers may
      // intentionally be withheld on later replay until they can be rebound.
      setMessages(prev => [...prev, { id: result.data!.messageId??Date.now() + 1, sessionId: sid, role: "assistant", messageText: result.data!.responseText, outputType: "explanation", safeMetadataJson: {ai_mod05_feedbackEligible:!!result.data!.messageId&&result.data!.feedbackEligible===true}, createdAt: new Date().toISOString() }]);
      // Store extras on last assistant message — we merge them in display
      setMessages((prev) => {
        const last = [...prev];
        const assistantIdx = last.findLastIndex((m) => m.role === "assistant");
        if (assistantIdx >= 0) {
          last[assistantIdx] = {
            ...last[assistantIdx],
            extras: {
              navigationLinks: result.data!.navigationLinks,
              searchResultSummary: result.data!.searchResultSummary,
              draftIds: result.data!.draftIds,
            },
          };
        }
        return last;
      });
      if (result.data.draftIds?.length) {
        const loaded = await getAssistantSession(sid);
        if (ticket === epoch.current && live() && selectedSession.current === sid && loaded.success && loaded.data) setDrafts(loaded.data.drafts);
      }
      await refreshSessions();
    } else {
      setNotice(result.error ?? "The response could not be verified.");
      setUncertain(result.code === "HISTORY_UNCONFIRMED");
      if (result.code !== "HISTORY_UNCONFIRMED") setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    }
  };

  const handleChipClick = (prompt: string) => {
    void handlePromptClick(prompt);
  };

  const handlePromptClick = async (prompt: string) => {
    if (!live() || isLoading || isCreating || uncertain) return;
    if (!activeSessionId) {
      const ticket = ++epoch.current;
      // Create session first, then send
      setIsCreating(true);
      let result;
      try { result = await startAssistantSession({ contextEntityType: initialEntityType, contextEntityId: initialEntityId }); }
      catch { if (ticket === epoch.current && live()) { setIsCreating(false); setNotice("Session creation is unconfirmed. Reload the session list before creating another."); } return; }
      if (ticket !== epoch.current || !live()) return;
      setIsCreating(false);
      if (result.success && result.data) {
        if (!live()) return;
        setSessions((prev) => [result.data!, ...prev]);
        setActiveSessionId(result.data.id);
        selectedSession.current = result.data.id;
        setMessages([]);
        setDrafts([]);
        // The first send follows the selected session effect; no stale state closure.
        setPendingPrompt({ sessionId: result.data.id, text: prompt });
      }
      return;
    }
    await handleSend(prompt);
  };
  const [pendingPrompt, setPendingPrompt] = useState<{ sessionId: number; text: string } | null>(null);
  useEffect(() => {
    if (!pendingPrompt || pendingPrompt.sessionId !== activeSessionId) return;
    const pending = pendingPrompt; setPendingPrompt(null);
    void handleSend(pending.text, pending.sessionId);
    // The pending request is consumed exactly once; retries remain explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt, activeSessionId]);

  const getDraftsForMessage = (msg: MessageWithExtras): AssistantDraftRow[] => {
    if (!msg.extras?.draftIds?.length) return [];
    return drafts.filter((d) => msg.extras!.draftIds!.includes(d.id));
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex h-[calc(100vh-180px)] min-h-[400px] bg-card border border-border rounded-xl overflow-hidden">
      {/* Session list (left panel) */}
      <AssistantSessionList
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        isCreating={isCreating}
      />

      {/* Chat area (right panel) */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {activeSession?.title ?? activeSession?.sessionCode ?? "AI Assistant"}
            </h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 text-amber-500 dark:text-amber-300" />
              Read-only · Draft-only · Human review required for all actions
            </p>
          </div>
        </div>

        {/* Action chips */}
        <AssistantActionChips onChipClick={handleChipClick} />
        {notice && <div role="status" className="px-4 py-2 text-sm text-muted-foreground">{notice}{uncertain && activeSessionId && <button type="button" className="underline ml-2" onClick={() => void loadSession(activeSessionId)}>Reload retained session</button>}</div>}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!activeSessionId || messages.length === 0 ? (
            <AssistantEmptyState onPromptClick={handlePromptClick} />
          ) : (
            <>
              {messages.map((msg) => (
                <AssistantMessageBubble
                  key={msg.id}
                  message={msg}
                  drafts={getDraftsForMessage(msg)}
                  navigationLinks={
                    msg.role === "assistant" ? msg.extras?.navigationLinks : undefined
                  }
                  searchResultSummary={
                    msg.role === "assistant" ? msg.extras?.searchResultSummary : undefined
                  }
                  onDraftStatusChange={() => activeSessionId && loadSession(activeSessionId)}
                />
              ))}
              {isLoading && <AssistantLoading />}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <AssistantChatInput
          onSend={handleSend}
          isLoading={isLoading}
          disabled={!activeSessionId || uncertain || !live()}
        />
      </div>
    </div>
  );
}
