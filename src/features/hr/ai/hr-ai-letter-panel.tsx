"use client";

/**
 * HR.12 — HR AI Letter / Email Draft Panel
 *
 * AI drafts HR correspondence for human review and editing.
 * No auto-send, no official finalization without user action.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Brain, Info, Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { draftHrLetterOrEmail } from "@/server/actions/hr/ai/hr-ai-letters";
import type { HrAiDraftOutput } from "@/lib/hr/ai/types";
import { HR_LETTER_TYPES } from "@/lib/hr/ai/types";

interface Props {
  employeeId: number;
  canUse: boolean;
  canViewPayroll?: boolean;
  canViewActions?: boolean;
}

export function HrAiLetterPanel({ employeeId, canUse, canViewPayroll = false, canViewActions = false }: Props) {
  const [draftType, setDraftType] = useState<string>("noc");
  const [purposeNote, setPurposeNote] = useState("");
  const [recipientContext, setRecipientContext] = useState("");
  const [result, setResult] = useState<HrAiDraftOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  const handleDraft = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await draftHrLetterOrEmail({
        employeeId,
        draftType: draftType as HrAiDraftOutput["draftType"],
        purposeNote: purposeNote.trim() || undefined,
        recipientContext: recipientContext.trim() || undefined,
      });
      if (res.success) {
        setResult(res.data);
        toast.success("Draft generated — please review before use.");
      } else {
        if (res.featureDisabled) setFeatureDisabled(true);
        setError(res.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyDraft = () => {
    if (!result?.draftText) return;
    navigator.clipboard.writeText(result.draftText).catch(() => {});
    toast.success("Draft copied to clipboard.");
  };

  if (!canUse) {
    return <Alert variant="default" className="bg-muted/40"><Info className="h-4 w-4" /><AlertDescription className="text-xs">hr.ai.use permission required.</AlertDescription></Alert>;
  }
  if (featureDisabled) {
    return <Alert variant="default" className="bg-muted/40"><Info className="h-4 w-4" /><AlertDescription className="text-xs">HR AI letter draft is disabled. Enable in Settings → AI Settings.</AlertDescription></Alert>;
  }

  // Filter available types based on permissions
  const availableTypes = HR_LETTER_TYPES.filter((t) => {
    if (t.value === "salary_certificate" && !canViewPayroll) return false;
    if (t.value === "warning_letter" && !canViewActions) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Letter / Email Draft Assist</p>
        <p className="text-xs text-muted-foreground">
          AI drafts HR correspondence for your review. You must edit and approve before official use.
          No auto-send or finalization.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Document Type</Label>
          <select
            value={draftType}
            onChange={(e) => { setDraftType(e.target.value); setResult(null); }}
            className="flex h-8 w-full rounded-md border border-input bg-background text-sm px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {availableTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Purpose (optional)</Label>
          <Input
            value={purposeNote}
            onChange={(e) => setPurposeNote(e.target.value)}
            placeholder="e.g. Visa renewal, bank account opening…"
            className="h-8 text-xs"
            maxLength={200}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Recipient Context (optional)</Label>
          <Input
            value={recipientContext}
            onChange={(e) => setRecipientContext(e.target.value)}
            placeholder="e.g. UAE Embassy, HR Manager…"
            className="h-8 text-xs"
            maxLength={200}
          />
        </div>
      </div>

      <Button size="sm" variant="outline" onClick={handleDraft} disabled={isLoading} className="gap-1.5">
        <Brain className="h-3.5 w-3.5" />
        {isLoading ? "Drafting…" : "Generate Draft"}
      </Button>

      {isLoading && <Skeleton className="h-48 w-full rounded-lg" />}
      {error && !isLoading && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}

      {result && !isLoading && (
        <div className="space-y-3">
          <Alert variant="default" className="bg-amber-50 border-amber-200 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs text-amber-700">
              This is an AI draft for review only. It is NOT official until reviewed, edited, and issued through the proper HR process.
            </AlertDescription>
          </Alert>

          {result.subject && (
            <div className="text-xs">
              <span className="font-medium">Subject:</span> {result.subject}
            </div>
          )}

          {result.sourceContextUsed.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-muted-foreground">Used:</span>
              {result.sourceContextUsed.map((s, i) => (
                <Badge key={i} variant="secondary" className="text-[9px]">{s}</Badge>
              ))}
            </div>
          )}

          <div className="relative">
            <Textarea
              value={result.draftText}
              readOnly
              rows={10}
              className="text-xs font-mono resize-none bg-muted/30"
            />
            <Button
              size="sm"
              variant="ghost"
              className="absolute top-2 right-2 h-6 w-6 p-0"
              onClick={handleCopyDraft}
              title="Copy draft"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>

          {result.warning && (
            <Alert variant="default" className="py-2">
              <AlertDescription className="text-xs">{result.warning}</AlertDescription>
            </Alert>
          )}
          <p className="text-[10px] text-muted-foreground italic">
            Copy this draft to the Report Center or Word processor. Official output must go through the Report Center template flow.
          </p>
        </div>
      )}
    </div>
  );
}
