"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, PlusCircle, Archive, RotateCcw } from "lucide-react";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { AuthContext } from "@/lib/rbac/check";
import { canReadCompanySignatories, canManageCompanySignatories, signatoryRow, type OwnerCompanySignatoryRow } from "@/lib/administration/company-signatory-contract";
import { queryKeys } from "@/lib/query/query-keys";
import { listCompanySignatories } from "@/server/actions/common-master-data/owner-company-signatories";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import { useWorkspaceFormOwner } from "@/hooks/use-workspace-form-owner";
import { newSignatorySnapshot, signatoryDraftKey, signatorySnapshot, signatoryRecoveryError, useCompanySignatoryEditor, type SignatorySnapshot } from "./use-company-signatory-editor";

type Props = { companyId: number; authContext: AuthContext; enabled: boolean; readOnly: boolean; onChildOpen: (open: boolean) => void };
export function CompanySignatoriesSection(props: Props) {
  const owner = useWorkspaceFormOwner();
  // A fresh read admission must recover the retained child task, not overwrite it
  // with a second create after a temporary permission loss.
  return <CompanySignatoriesSession key={`${props.authContext.profile?.id ?? "none"}:${props.companyId}:${owner?.id ?? "none"}:${canReadCompanySignatories(props.authContext, props.companyId)}`} {...props} />;
}
function CompanySignatoriesSession({ companyId, authContext, enabled, readOnly, onChildOpen }: Props) {
  const principalId = authContext.profile?.id ?? 0;
  const canRead = canReadCompanySignatories(authContext, companyId);
  const canEdit = !readOnly && canManageCompanySignatories(authContext, companyId);
  const owner = useWorkspaceFormOwner();
  const store = useWorkspaceDraftStoreContext();
  const draftKey = signatoryDraftKey(owner?.id ?? null, principalId, companyId);
  const [restored] = useState(() => {
    const raw = canRead && draftKey ? store?.getDraft(draftKey) : undefined;
    if (!raw) return { snapshot: null, error: null };
    try {
      if (Object.keys(raw).length !== 1 || typeof raw.signatory !== "string") throw new Error();
      const value = signatorySnapshot.parse(JSON.parse(raw.signatory));
      if (value.principalId !== principalId || value.companyId !== companyId || value.ownerId !== (owner?.id ?? null)) throw new Error();
      return { snapshot: value, error: null };
    } catch { return { snapshot: null, error: signatoryRecoveryError }; }
  });
  const [editor, setEditor] = useState<SignatorySnapshot | null>(restored.snapshot);
  const [openingError, setOpeningError] = useState<string | null>(restored.error);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...queryKeys.commonMd.companySignatories(companyId), principalId],
    enabled: enabled && canRead,
    queryFn: async () => {
      const result = await listCompanySignatories(companyId);
      const parsed = signatoryRow.array().safeParse(result.data);
      if (!result.success || !parsed.success || parsed.data.some(row => row.company_id !== companyId)) throw new Error("Signatories could not be loaded.");
      return parsed.data;
    },
  });
  useEffect(() => { onChildOpen(!!editor || !!openingError); return () => onChildOpen(false); }, [editor, openingError, onChildOpen]);
  const open = (row: OwnerCompanySignatoryRow | null, action: SignatorySnapshot["action"]) => {
    if (!canEdit || query.isPending || query.isError || editor || openingError) return;
    const snapshot = newSignatorySnapshot(principalId, companyId, owner?.id ?? null, row, action);
    try { if (draftKey) store?.setDraft(draftKey, { signatory: JSON.stringify(snapshot) }); setEditor(snapshot); }
    catch { setOpeningError(signatoryRecoveryError); }
  };
  const columns: ColumnDef<OwnerCompanySignatoryRow>[] = [
    { accessorKey: "full_name", header: "Signatory" }, { accessorKey: "designation", header: "Designation" }, { accessorKey: "signature_scope", header: "Signature scope" },
    { accessorKey: "is_primary", header: "Primary", cell: ({ row }) => row.original.is_primary ? "Yes" : "No" },
    { accessorKey: "is_active", header: "Status", cell: ({ row }) => row.original.deleted_at ? "Archived" : row.original.is_active ? "Active" : "Inactive" },
    { id: "actions", header: "Actions", enableHiding: false, enableSorting: false, cell: ({ row }) => canEdit ? <div className="flex">
      {!row.original.deleted_at && <Button type="button" variant="ghost" aria-label="Edit signatory" onClick={() => open(row.original, "save")}><Pencil className="h-4 w-4" /></Button>}
      <Button type="button" variant="ghost" aria-label={row.original.deleted_at ? "Restore signatory" : "Archive signatory"} onClick={() => open(row.original, row.original.deleted_at ? "restore" : "archive")}>
        {row.original.deleted_at ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      </Button></div> : null },
  ];
  return <div className="space-y-3">
    {!canRead ? <p role="alert">Signatory read access for this company is required.</p>
      : <>
        {!canEdit && <p className="text-sm text-muted-foreground">Signatories are read-only. Changes require signatory read and management permission for this company and an editable workspace.</p>}
        {query.isPending ? <p role="status">Loading signatories…</p> : query.isError ? <div role="alert"><p>Signatories could not be loaded. No complete register is available.</p><Button type="button" variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>
          : <><div className="flex justify-end">{canEdit && <Button type="button" size="sm" variant="outline" disabled={!!editor || !!openingError} onClick={() => open(null, "save")}><PlusCircle className="h-4 w-4 mr-1" />Add Signatory</Button>}</div>
            <ERPDataTable presentation="embedded" tableId={`company.signatories:${companyId}`} resultsLabel="Signatories" data={query.data ?? []} columns={columns} enableRowSelection={false} /></>}
      </>}
    {openingError && <p role="alert">{openingError}</p>}
    {editor && <CompanySignatoryDialog key={editor.sessionId} snapshot={editor} canRead={canRead} canEdit={canEdit}
      onClose={() => { setEditor(null); void queryClient.invalidateQueries({ queryKey: queryKeys.commonMd.companySignatories(companyId) }); }} />}
  </div>;
}

export function CompanySignatoryDialog({ snapshot, canRead, canEdit, onClose }: { snapshot: SignatorySnapshot; canRead: boolean; canEdit: boolean; onClose: () => void }) {
  const editor = useCompanySignatoryEditor(snapshot, canRead && canEdit, onClose);
  const title = snapshot.action === "archive" ? "Archive Signatory" : snapshot.action === "restore" ? "Restore Signatory" : snapshot.openingId ? "Edit Signatory" : "Add Signatory";
  const close = () => { if (editor.discard()) onClose(); };
  return <ERPChildDialogForm open title={title} mode="edit" isSubmitting={editor.saving} isDirty={editor.dirty}
    closeDisabled={editor.uncertain || editor.blocked} submitDisabled={!canEdit || !canRead || editor.blocked || editor.confirmedLocally}
    submitLabel={editor.uncertain ? "Retry unchanged request" : snapshot.action === "archive" ? "Archive" : snapshot.action === "restore" ? "Restore" : "Save"}
    onOpenChange={open => { if (!open) close(); }} onSubmit={editor.save}>
    {editor.error && <p role="alert" className="mb-3 text-sm">{editor.error}</p>}
    {!canRead ? <p role="alert">Signatory access is unavailable. Any pending request remains retained for recovery when access is restored.</p> : <>
      <p className="mb-3 text-xs text-muted-foreground">Entries and retry details are held only in this workspace’s memory. A browser reload or sign-out clears them; review the saved register before starting a replacement request.</p>
      {snapshot.action === "archive" && <p className="mb-3 text-sm">Archive this signatory and retain its history? It will become inactive and can be restored here.</p>}
      {snapshot.action === "restore" && <p className="mb-3 text-sm">Restore this signatory to the register? It remains inactive until explicitly edited.</p>}
      <form onSubmit={event => { event.preventDefault(); event.stopPropagation(); void editor.save(); }}>
        <fieldset disabled={editor.locked} className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="sig_full_name" className="text-xs">Full Name *</Label><Input id="sig_full_name" name="full_name" required maxLength={200} value={editor.fields.full_name} onChange={event => editor.update("full_name", event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="sig_designation" className="text-xs">Designation</Label><Input id="sig_designation" name="designation" maxLength={200} value={editor.fields.designation} onChange={event => editor.update("designation", event.target.value)} /></div>
          <div className="col-span-2 space-y-1"><Label htmlFor="sig_scope" className="text-xs">Signature Scope</Label><Input id="sig_scope" name="signature_scope" maxLength={500} placeholder="e.g., Financial documents up to AED 500K" value={editor.fields.signature_scope} onChange={event => editor.update("signature_scope", event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="sig_from" className="text-xs">Effective From</Label><Input type="date" id="sig_from" name="effective_from" value={editor.fields.effective_from} onChange={event => editor.update("effective_from", event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="sig_to" className="text-xs">Effective To</Label><Input type="date" id="sig_to" name="effective_to" value={editor.fields.effective_to} onChange={event => editor.update("effective_to", event.target.value)} /></div>
          <div className="flex items-center gap-2 pt-2"><Checkbox id="sig_primary" name="is_primary" checked={editor.fields.is_primary} onCheckedChange={value => editor.update("is_primary", value === true)} /><Label htmlFor="sig_primary" className="text-xs cursor-pointer">Primary Signatory</Label></div>
          <div className="flex items-center gap-2 pt-2"><Checkbox id="sig_active" name="is_active" checked={editor.fields.is_active} onCheckedChange={value => editor.update("is_active", value === true)} /><Label htmlFor="sig_active" className="text-xs cursor-pointer">Active</Label></div>
          <div className="col-span-2 space-y-1"><Label htmlFor="sig_notes" className="text-xs">Notes</Label><Textarea id="sig_notes" name="notes" maxLength={2000} value={editor.fields.notes} onChange={event => editor.update("notes", event.target.value)} /></div>
        </fieldset>
      </form>
    </>}
  </ERPChildDialogForm>;
}
