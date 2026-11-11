"use client";
import type {ReactNode,ComponentProps} from 'react';
import {Bot,FileText,RefreshCw,CheckCircle2,RotateCcw,Save,AlertTriangle,FileIcon,ExternalLink} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Separator} from '@/components/ui/separator';
import {Badge} from '@/components/ui/badge';
import {DmsAiIntakeStatusBadge} from './dms-ai-intake-status-badge';
import {DmsAiConfidenceBadge} from '@/features/dms/ai/dms-ai-confidence-badge';
import {DmsAiIntakeReviewForm,type ReviewFormValues} from './dms-ai-intake-review-form';
import type {IntakeSessionData,IntakeAiResultRow} from '@/server/actions/dms/ai-intake';
import type {DmsDocumentTypeRow} from '@/server/actions/dms/document-types';
import {DmsOrchestrationProgressCard} from '@/features/dms/orchestration';
import {DmsIntakeLinkPanel,type IntakeLinkChip} from './dms-intake-link-panel';
import {DmsExactFileReview} from './dms-exact-file-review';
import {DmsIntakeDiscardConfirmation} from './dms-intake-discard-confirmation';
import type {IntakeReviewConfirmation} from '@/lib/dms/intake-review';
type Action=()=>void;
export type IntakeViewProps={
 session:IntakeSessionData;displaySession:IntakeSessionData;aiResult:IntakeAiResultRow|null;
 documentTypes:DmsDocumentTypeRow[];formValues:ReviewFormValues;handleFormChange:(p:Partial<ReviewFormValues>)=>void;
 entityLinks:IntakeLinkChip[];setEntityLinks:(v:IntakeLinkChip[])=>void;
 isReady:boolean;isFailed:boolean;isProcessing:boolean;isPending:boolean;
 retainedApproval:boolean;approvalBlocked:boolean;draftUncertain:boolean;
 approvalError?:{message:string;fieldId?:number}|null;
 approvalLoading:boolean;retentionError:unknown;batchLoading:boolean;batchBlocked:boolean;
 handleRetry:Action;handleSaveDraft:Action;handleApprove:Action;handleDiscard:Action;handlePreview:Action;isLoadingPreview:boolean;
 discardAnchor:'header'|'footer'|null;setDiscardAnchor:(v:'header'|'footer'|null)=>void;discardReason:string;setDiscardReason:(v:string)=>void;
 setFileReview:(v:IntakeReviewConfirmation|null)=>void;setReviewBlockReason?:(reason:string|null)=>void;navigate:(url:string)=>void;
 onAiResultPatch:(p:Partial<IntakeAiResultRow>,snapshot?:string)=>void;
 savedDocument?:{progress:ReactNode;notice:ReactNode;confirmation:ReactNode;canRerun?:boolean;canSaveDraft?:boolean;form:NonNullable<ComponentProps<typeof DmsAiIntakeReviewForm> extends infer P ? P extends {savedDocument?:infer S}?S:never:never>};
};
function formatBytes(bytes:number){return bytes<1024?bytes+' B':bytes<1024*1024?(bytes/1024).toFixed(1)+' KB':(bytes/(1024*1024)).toFixed(1)+' MB';}
export function DmsAiIntakeView({session,displaySession,aiResult,documentTypes,formValues,handleFormChange,entityLinks,setEntityLinks,isReady,isFailed,isProcessing,isPending,retainedApproval,approvalBlocked,draftUncertain,approvalError,approvalLoading,retentionError,batchLoading,batchBlocked,handleRetry,handleSaveDraft,handleApprove,handleDiscard,handlePreview,isLoadingPreview,discardAnchor,setDiscardAnchor,discardReason,setDiscardReason,setFileReview,setReviewBlockReason,navigate,onAiResultPatch,savedDocument}:IntakeViewProps){
 const classificationConf=aiResult?.classification_confidence??null,classificationScore=aiResult?.classification_score??null;
  return (
    <div data-intake-review className="flex flex-col min-h-0 gap-0">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold">AI-Assisted Document Intake</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">{session.session_code}</span>
              <DmsAiIntakeStatusBadge status={session.intake_status} />
              {classificationConf && (
                <DmsAiConfidenceBadge label={classificationConf} score={classificationScore} />
              )}
              {session.is_duplicate && (
                <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50">
                  Duplicate File Detected
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-2 shrink-0">
          {(savedDocument ? savedDocument.canRerun : isFailed || isReady) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={isPending || retainedApproval || draftUncertain}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Re-run AI
            </Button>
          )}
          {isReady && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                disabled={isPending || retainedApproval || (savedDocument?.canSaveDraft === false && !draftUncertain)}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save Draft
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isPending || approvalBlocked || draftUncertain}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isPending ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                {savedDocument && isPending ? "Saving…" : retainedApproval ? "Recover saved request" : savedDocument ? "Update & Save" : "Approve & Save"}
              </Button>
            </>
          )}
          {!savedDocument && <DmsIntakeDiscardConfirmation placement="header" open={discardAnchor==="header"}
            onOpenChange={open=>setDiscardAnchor(open?"header":null)} disabled={retainedApproval||draftUncertain}
            pending={isPending} hasDraftDocument={!!session.document_id} canSaveDraft={isReady}
            reason={discardReason} onReasonChange={setDiscardReason} onConfirm={handleDiscard}/>}
        </div>
      </div>

      {approvalError && <p role="alert" className="mt-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
        {approvalError.message}
        {approvalError.fieldId !== undefined && <button type="button" className="ml-2 underline" disabled={isPending}
          onClick={event => event.currentTarget.closest("[data-intake-review]")?.querySelector<HTMLElement>(`#intake-metadata-${approvalError.fieldId}`)?.focus()}>
          Go to field
        </button>}
      </p>}
      {draftUncertain && <p role="status" className="mt-3 text-sm">Draft save is unconfirmed. Retry Save draft to recover its original reviewed values before approval, analysis or discard.</p>}
      {retainedApproval && <p role="status" className="mt-3 text-sm text-amber-700">{savedDocument?'An update is retained for recovery. Recover saved request uses the exact reviewed values. Do not run AI again until this save is confirmed.':'An approval request is retained for recovery. Retry uses its original reviewed values, even if the form has changed. To cancel an uncommitted upload, use Discard in the Upload Inbox. Do not re-run analysis.'}</p>}
      {approvalLoading&&!session.document_id&&<p role="status" className="mt-3 text-sm text-muted-foreground">Checking for an earlier approval…</p>}
      {!!retentionError && !session.document_id && <p role="alert" className="mt-3 text-sm text-destructive">The retained approval could not be read. Reopen the original workspace; a replacement request will not be created.</p>}
      {session.document_id&&batchLoading&&<p role="status" className="mt-3 text-sm">Checking the original finalization request…</p>}
      {session.document_id&&batchBlocked&&<p role="alert" className="mt-3 text-sm text-destructive">The original finalization could not be read. Reopen this intake after access is restored; do not submit a replacement.</p>}

      {/* ── Processing state ─────────────────────────────────────────────────── */}
      {isProcessing && (
        <div className="mt-6 flex flex-col items-center justify-center gap-4 py-16">
          <div className="h-12 w-12 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium">AI is analyzing your document…</p>
            <p className="text-xs text-muted-foreground mt-1">This may take 10–30 seconds depending on file size and AI provider.</p>
          </div>
          <DmsAiIntakeStatusBadge status={session.intake_status} />
        </div>
      )}

      {/* ── Failed state ──────────────────────────────────────────────────────── */}
      {isFailed && (
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-6 space-y-3">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="h-5 w-5" />
            AI Analysis Failed
          </div>
          <p className="text-sm text-muted-foreground">
            The AI could not analyze your document. You can retry the analysis or create the document manually.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleRetry} disabled={isPending}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Retry AI
            </Button>
            {!savedDocument && <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/dms/documents/record/new")}
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Create Manually
            </Button>}
          </div>
        </div>
      )}

      {/* ── AI Orchestration Progress Card (ORCH.1) ───────────────────────────── */}
      {!savedDocument && isReady && session.document_id && (
        <div className="mt-4">
          <DmsOrchestrationProgressCard
            sessionCode={session.session_code}
            documentId={session.document_id}
            autoTrigger
          />
        </div>
      )}

      {savedDocument?.progress}
      {savedDocument?.notice}
      {savedDocument?.confirmation}
      {/* ── Review layout ─────────────────────────────────────────────────────── */}
      {isReady && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* ── Left panel: File info + AI summary ──────────────────────────── */}
          <div className="lg:col-span-1 space-y-4">
            {/* File info card */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{session.original_filename}</span>
              </div>
              <Separator />
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Size</dt>
                  <dd className="font-mono">{formatBytes(session.file_size_bytes)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="font-mono truncate">{session.mime_type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Intake</dt>
                  <dd><DmsAiIntakeStatusBadge status={session.intake_status} /></dd>
                </div>
                {session.is_duplicate && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Duplicate</dt>
                    <dd>
                      <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50">
                        Yes
                      </Badge>
                    </dd>
                  </div>
                )}
              </dl>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={handlePreview}
                disabled={isLoadingPreview}
              >
                {isLoadingPreview ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                )}
                Preview File
              </Button>
            </div>

            {/* AI Summary card */}
            {aiResult && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-500 shrink-0" />
                  <span className="text-sm font-medium">AI Analysis Summary</span>
                </div>
                <Separator />
                <dl className="space-y-2 text-xs">
                  {aiResult.suggested_type && (
                    <div>
                      <dt className="text-muted-foreground mb-0.5">Suggested Type</dt>
                      <dd className="font-medium">{aiResult.suggested_type.name_en}</dd>
                    </div>
                  )}
                  {aiResult.classification_reason && (
                    <div>
                      <dt className="text-muted-foreground mb-0.5">Classification Reason</dt>
                      <dd className="text-muted-foreground italic text-[11px] leading-relaxed line-clamp-3">
                        {aiResult.classification_reason}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted-foreground mb-0.5">Classification Confidence</dt>
                    <dd>
                      <DmsAiConfidenceBadge
                        label={aiResult.classification_confidence}
                        score={aiResult.classification_score}
                      />
                    </dd>
                  </div>
                  {aiResult.expiry_date_suggestion && (
                    <div>
                      <dt className="text-muted-foreground mb-0.5">Suggested Expiry</dt>
                      <dd className="font-mono">{aiResult.expiry_date_suggestion}</dd>
                    </div>
                  )}
                  {aiResult.extracted_fields_json && (
                    <div>
                      <dt className="text-muted-foreground mb-0.5">Extracted Fields</dt>
                      <dd>{Object.keys(aiResult.extracted_fields_json).filter((k) => k !== "__additional_fields").length} field(s)</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* HR.DOCLINK.1A — Link to ERP Records (suggestions + manual picker).
                Replaces the old display-only "Matched Parties" card: party matches
                now appear here as actionable checkbox suggestions. */}
            <DmsIntakeLinkPanel
              sessionCode={session.session_code}
              suggestionsOverride={savedDocument ? [] : undefined}
              aiReady={isReady}
              disabled={isPending || retainedApproval || approvalBlocked}
              value={entityLinks}
              onChange={setEntityLinks}
            />

            {/* AI warnings */}
            {(() => {
              const raw = aiResult?.raw_response_json as { warnings?: unknown } | null | undefined;
              const warnings = Array.isArray(raw?.warnings)
                ? (raw!.warnings as unknown[]).filter((w): w is string => typeof w === "string")
                : [];
              if (warnings.length === 0) return null;
              return (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    AI Notes
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                    {warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              );
            })()}

            {/* Duplicate warning */}
            {session.is_duplicate && session.duplicate_document_id && (
              <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-400">
                  <AlertTriangle className="h-4 w-4" />
                  Duplicate File
                </div>
                <p className="text-xs text-orange-600 dark:text-orange-500">
                  A document with the same file hash already exists in the system.
                  You can still approve this intake to create a new document.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs border-orange-300"
                  onClick={() => navigate(`/dms/documents/record/${session.duplicate_document_id}`)}
                >
                  View Existing Document
                </Button>
              </div>
            )}
          </div>

          {/* ── Right panel: Review form ───────────────────────────────────── */}
          <div className="lg:col-span-2">
            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center gap-2 mb-5">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Review &amp; Correct AI-Filled Fields</h3>
                {aiResult && (
                  <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 ml-auto">
                    AI Pre-filled
                  </Badge>
                )}
              </div>
              <fieldset disabled={isPending || retainedApproval || draftUncertain}>
              <DmsAiIntakeReviewForm
                session={displaySession}
                values={formValues}
                onChange={handleFormChange}
                initialDocTypes={documentTypes}
                aiResultOverride={aiResult}
                onAiResultPatch={onAiResultPatch}
                savedDocument={savedDocument?.form}
              />
              </fieldset>
            </div>
          </div>
        </div>
      )}

      {!savedDocument&&isReady&&!retainedApproval&&<DmsExactFileReview sessionId={session.id} typeId={formValues.documentTypeId??undefined} expiryDate={formValues.expiryDate||null} reviewKey={JSON.stringify({formValues,entityLinks,aiResultId:aiResult?.id})} disabled={isPending} onChange={setFileReview} onBlockReason={setReviewBlockReason}/>}
      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      {isReady && (
        <div className="mt-6 flex items-center justify-between border-t pt-4">
          {!savedDocument && <DmsIntakeDiscardConfirmation placement="footer" open={discardAnchor==="footer"}
            onOpenChange={open=>setDiscardAnchor(open?"footer":null)} disabled={retainedApproval||draftUncertain}
            pending={isPending} hasDraftDocument={!!session.document_id} canSaveDraft={isReady}
            reason={discardReason} onReasonChange={setDiscardReason} onConfirm={handleDiscard}/>}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={isPending || retainedApproval || (savedDocument?.canSaveDraft === false && !draftUncertain)}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save Draft
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={isPending || approvalBlocked || draftUncertain}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isPending ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              {savedDocument && isPending ? "Saving…" : retainedApproval ? "Recover saved request" : savedDocument ? "Update & Save" : "Approve & Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
