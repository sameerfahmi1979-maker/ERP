"use client";

import { useState, useEffect, useRef } from "react";
import {useQuery} from "@tanstack/react-query";
import {readJson,retryAuthorizedRead} from "@/lib/reads/client";
import type {DmsReadPage} from "@/server/reads/dms-documents";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ERPChildDialogForm } from "@/features/dms/documents/section-read-boundary";
import { ERPCombobox } from "@/components/erp/combobox/erp-combobox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Paperclip } from "lucide-react";
import type { DmsUploadSessionRow } from "@/server/actions/dms/upload-sessions";
import type { DmsDocumentRow } from "@/server/actions/dms/documents";
import { attachUploadToExistingDocument } from "@/server/actions/dms/document-upload-attach";
import { FileTypeIcon } from "./dms-file-type-icon";
import { FileSize } from "./dms-file-size";
import {DmsExactFileReview} from '@/features/dms/intake/dms-exact-file-review';
import {confirmExactIntakeReview} from '@/server/actions/dms/intake-review';
import type {IntakeReviewConfirmation} from '@/lib/dms/intake-review';
import {DmsAttachmentRecovery} from './dms-attachment-recovery';

interface DmsUploadAttachDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: DmsUploadSessionRow | null;
  documents: DmsDocumentRow[];
  onSuccess?: (documentId: number) => void;
}

export function DmsUploadAttachDialog(props: DmsUploadAttachDialogProps) {
  return props.open && props.session ? <UploadAttachSession key={props.session.id} {...props} /> : null;
}

function UploadAttachSession({
  open,
  onOpenChange,
  session,
  onSuccess,
}: DmsUploadAttachDialogProps) {
  const router = useRouter();
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [changeNotes, setChangeNotes] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileReview,setFileReview]=useState<IntakeReviewConfirmation|null>(null);
  const confirmedReview=useRef<string|null>(null);
  const [recoveryBlocking,setRecoveryBlocking]=useState(true);

  const flight=useRef(false);
  const [search,setSearch]=useState(""),[debounced,setDebounced]=useState("");
  const [selected,setSelected]=useState<{value:number;label:string}|null>(null);
  useEffect(()=>{const t=setTimeout(()=>setDebounced(search),250);return()=>clearTimeout(t);},[search]);
  const targetQuery=useQuery({queryKey:["dms","attach-targets",session?.id,debounced],enabled:open&&!!session,queryFn:async({signal})=>{
   const r=await readJson<{success:true;data:DmsReadPage}>("dms-documents",{page:1,pageSize:50,sortKey:"document_no",sortDir:"asc",filters:{search:debounced,excludeArchived:true}},signal);return r.data;
  },retry:retryAuthorizedRead,staleTime:15000});
  const targetReady=targetQuery.isSuccess&&!targetQuery.isFetching&&search===debounced;
  const documentOptions=targetQuery.isError?[]:(targetQuery.data?.rows??[]).map(d=>({value:d.id,label:`${d.document_no} — ${d.title}`}));
  if(selected&&!targetQuery.isError&&!documentOptions.some(row=>row.value===selected.value))documentOptions.unshift(selected);

  const handleSubmit = async () => {
    if(recoveryBlocking){toast.error('Read or reconcile the original attachment request before starting a replacement.');return;}
    if (!session || !targetReady || flight.current) return;
    if (!documentId) {
      toast.error("Please select a document");
      return;
    }
    flight.current=true;setIsSubmitting(true);
    try {
      if(!fileReview||fileReview.sessionId!==session.id||fileReview.documentId!==documentId){toast.error('Verify and confirm the original file for this destination first.');return;}
      const key=JSON.stringify(fileReview);
      if(confirmedReview.current!==key){const reviewed=await confirmExactIntakeReview(fileReview);if(!reviewed.success){toast.error(reviewed.error);return;}confirmedReview.current=key;}
      const result = await attachUploadToExistingDocument({
        uploadSessionId: session.id,
        documentId,
        changeNotes: changeNotes || undefined,
        versionLabel: versionLabel || undefined,
        allowDuplicate: session.is_duplicate,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to attach file");
        return;
      }
      toast.success("File attached to document successfully");
      onOpenChange(false);
      setDocumentId(null);
      setChangeNotes("");
      setVersionLabel("");
      onSuccess?.(documentId);
      router.refresh();
    } finally {
      flight.current=false;setIsSubmitting(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!isSubmitting) {
      onOpenChange(open);
      if (!open) {
        setDocumentId(null);
        setChangeNotes("");
        setVersionLabel("");
      }
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleClose}
      title="Attach to Existing Document"
      subtitle="Select a DMS document to attach this uploaded file to as a new version"
      icon={<Paperclip className="h-5 w-5" />}
      mode="add"
      size="lg"
      isSubmitting={isSubmitting}
      isDirty={documentId !== null || changeNotes !== "" || versionLabel !== ""}
      onSubmit={handleSubmit}
    >
      <div className="space-y-4">
        {session&&<DmsAttachmentRecovery open={open} uploadSessionId={session.id} onBlockingChange={setRecoveryBlocking} onRecovered={id=>{onSuccess?.(id);onOpenChange(false);router.refresh();}} onCancelled={()=>{onOpenChange(false);router.refresh();}}/>}
        {session && (
          <div className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/10">
            <FileTypeIcon mimeType={session.mime_type} className="h-5 w-5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.original_filename}</p>
              <p className="text-xs text-muted-foreground">
                <FileSize bytes={session.file_size_bytes} /> · {session.mime_type}
              </p>
            </div>
          </div>
        )}

        <div>
          <Label className="mb-1.5 block">
            Target Document <span className="text-destructive">*</span>
          </Label>
          <p className="text-xs text-muted-foreground">Shows up to 50 permitted matches. Search to find another document.</p>
          <ERPCombobox
            options={documentOptions}
            value={documentId}
            onValueChange={(v) => {if(!targetReady)return;setDocumentId(v as number | null);setSelected(documentOptions.find(row=>row.value===v)??null);}}
            onSearchQueryChange={setSearch}
            filterFn={()=>true}
            loading={!targetReady&&!targetQuery.isError}
            error={targetQuery.isError?"Document choices unavailable. Search again to retry.":undefined}
            placeholder="Search and select a document…"
            searchPlaceholder="Search by document number or title…"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="version-label" className="mb-1.5 block">
              Version Label <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="version-label"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="e.g. 2026 Renewal"
              maxLength={100}
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="change-notes" className="mb-1.5 block">
              Change Notes <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="change-notes"
              value={changeNotes}
              onChange={(e) => setChangeNotes(e.target.value)}
              placeholder="What changed in this version?"
              rows={2}
              maxLength={2000}
            />
          </div>
        </div>

        {session&&documentId&&<DmsExactFileReview sessionId={session.id} documentId={documentId} reviewKey={JSON.stringify({changeNotes,versionLabel})} disabled={isSubmitting} onChange={setFileReview}/>}
        {session?.is_duplicate && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            This upload is marked as a duplicate. Linking it does not grant an administrator override; exact-file review and destination permissions still apply.
          </div>
        )}
      </div>
    </ERPChildDialogForm>
  );
}
