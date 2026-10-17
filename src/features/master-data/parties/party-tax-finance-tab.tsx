"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";

import { useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, Receipt, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {PartyChildLifecycleControl,usePartyChildLifecycle} from './party-child-lifecycle-control';
import {PartyChildSaveDialog,type SavePartyChild} from './party-child-save-dialog';
import type {CreatePartyTaxInput} from './party-schemas';

import { ERPCombobox } from "@/components/erp/combobox";
import { RequiredLabel } from "@/components/erp/required-label";
import { TaxTypeSelect } from "@/components/erp/finance-basics";
import { PartyFinanceProfileEditor } from "./party-finance-profile-editor";
import { usePartyTaxRegistrationsQuery } from "./hooks/use-party-child-queries";
import { invalidatePartyTaxRegistrations } from "@/lib/query/invalidation";
import {
  createPartyTaxRegistration,
  updatePartyTaxRegistration,
} from "@/server/actions/master-data/party-tax-registrations";
import {
  getPartyTaxStatuses,
} from "@/server/actions/master-data/parties";
import type { PartyTaxRegistration } from "./party-types";
import type {AuthContext} from '@/lib/rbac/check';
import {hasGlobalPermission} from '@/lib/rbac/scope';

type PartyTaxFinanceTabProps = {
  partyId: number;
  disabled?: boolean;
  authContext?: AuthContext;
  onChildOpen?: (open: boolean) => void;
  onInlineTaskOpen?: (open: boolean) => void;
};

const emptyTaxForm = {
  tax_type_id: null as number | null,
  tax_registration_number: "",
  tax_country_id: null as number | null,
  tax_status_id: null as number | null,
  effective_from: "",
  effective_to: "",
  reverse_charge_applicable: false,
  vat_exempt: false,
  is_primary: false,
  is_active: true,
  remarks: "",
};

export function PartyTaxFinanceTab({ partyId, disabled:parentDisabled, authContext, onChildOpen, onInlineTaskOpen }: PartyTaxFinanceTabProps) {
  const disabled=parentDisabled || !authContext || !hasGlobalPermission(authContext,'master_data.parties.manage_tax') || !hasGlobalPermission(authContext,'master_data.parties.view');
  const queryClient = useQueryClient();
  const { items: taxRegs, isLoading: taxLoading, error: taxError, refetch: refetchTax } = usePartyTaxRegistrationsQuery(partyId);

  // Tax dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [taxLifecycleOpen, setTaxLifecycleOpen] = useState(false);
  const lifecycle=usePartyChildLifecycle({entity:'party_tax_registrations',onSaved:()=>{invalidatePartyTaxRegistrations(queryClient,partyId);},onOpenChange:setTaxLifecycleOpen});
  const lifecycleOpen=lifecycle.isOpen;
  const setDialogOpen = (open: boolean) => { setIsDialogOpen(open); };
  // Tax tasks use the portal/inert channel; inline finance has a separate guard.
  // Neither source clears the other's guard or the parent record's dirty state.
  useEffect(() => { onChildOpen?.(isDialogOpen || taxLifecycleOpen); }, [isDialogOpen, taxLifecycleOpen, onChildOpen]);
  useEffect(() => () => onChildOpen?.(false), [onChildOpen]);
  const [editingTax, setEditingTax] = useState<PartyTaxRegistration | null>(null);
  const [taxForm, setTaxForm] = useState({ ...emptyTaxForm });
  const [isSubmittingTax, setIsSubmittingTax] = useState(false);


  const { data: taxStatuses } = useQuery({
    queryKey: ["party_tax_statuses"],
    queryFn: async () => (await getPartyTaxStatuses()).data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  const openAddTax = () => {
    if(lifecycleOpen)return;
    setEditingTax(null);
    setTaxForm({ ...emptyTaxForm });
    setDialogOpen(true);
  };

  const openEditTax = (item: PartyTaxRegistration) => {
    if(lifecycleOpen)return;
    setEditingTax(item);
    setTaxForm({
      tax_type_id: item.tax_type_id,
      tax_registration_number: item.tax_registration_number,
      tax_country_id: item.tax_country_id,
      tax_status_id: item.tax_status_id,
      effective_from: item.effective_from ?? "",
      effective_to: item.effective_to ?? "",
      reverse_charge_applicable: item.reverse_charge_applicable,
      vat_exempt: item.vat_exempt,
      is_primary: item.is_primary,
      is_active: item.is_active,
      remarks: item.remarks ?? "",
    });
    setDialogOpen(true);
  };


  const handleSubmitTax = async (save:SavePartyChild<CreatePartyTaxInput>) => {
    if (!taxForm.tax_type_id || !taxForm.tax_registration_number || !taxForm.tax_status_id) {
      toast.error("Fill in required fields");
      return;
    }
    setIsSubmittingTax(true);
    try {
      const payload = {
        party_id: partyId,
        tax_type_id: taxForm.tax_type_id!,
        tax_registration_number: taxForm.tax_registration_number,
        tax_country_id: taxForm.tax_country_id,
        tax_status_id: taxForm.tax_status_id!,
        effective_from: taxForm.effective_from || null,
        effective_to: taxForm.effective_to || null,
        reverse_charge_applicable: taxForm.reverse_charge_applicable,
        vat_exempt: taxForm.vat_exempt,
        is_primary: taxForm.is_primary,
        is_active: taxForm.is_active,
        remarks: taxForm.remarks || null,
      };
      const result = await save(payload);

      if (result.success) {
        toast.success(result.data?.changed === false ? "No changes to save" : `Tax registration ${editingTax ? "updated" : "added"}`);
        setDialogOpen(false);
        invalidatePartyTaxRegistrations(queryClient, partyId);
      } else {
        toast.error(result.error ?? "Failed to save");
      }
    } finally {
      setIsSubmittingTax(false);
    }
  };

  const taxColumns: ColumnDef<PartyTaxRegistration>[] = [
    {id:'archive_state',header:'Archive status',accessorFn:row=>row.archived_at?'Archived':'Current'},
{ id:"registration",header:"Tax registration",size:320,accessorFn:tax=>[tax.tax_registration_code,tax.tax_registration_number,tax.tax_type_name,tax.tax_status_name].filter(Boolean).join(" "),cell:({row})=>{const tax=row.original;return (<div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{tax.tax_registration_code}</span>
                    {tax.is_primary && <Badge className="text-xs">Primary</Badge>}
                    {tax.reverse_charge_applicable && <Badge variant="outline" className="text-xs">RCM</Badge>}
                    {tax.vat_exempt && <Badge variant="secondary" className="text-xs">VAT Exempt</Badge>}
                  </div>
                  <div className="font-medium text-sm">{tax.tax_registration_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {tax.tax_type_name && <span>{tax.tax_type_name} · </span>}
                    {tax.tax_status_name && <span>{tax.tax_status_name}</span>}
                  </div>
                </div>);}},
{accessorKey:"tax_status_name",header:"Status"},
{id:"actions",header:"Actions",enableSorting:false,enableHiding:false,cell:({row})=>{const tax=row.original;return (<div className="flex gap-1 shrink-0">
                  {tax.dms_certificate_document_id && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => window.open(`/dms/documents/record/${tax.dms_certificate_document_id}`, "_blank")}
                      title="Open certificate in DMS"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open Certificate
                    </Button>
                  )}
                  {!disabled && (
                    <>
                      <Button type="button" variant="ghost" size="icon" aria-label="Edit registration" className="h-7 w-7" disabled={Boolean(tax.archived_at)} onClick={() => openEditTax(tax)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <PartyChildLifecycleControl record={tax} onOpen={()=>lifecycle.open(tax,tax.tax_registration_code)}/>
                    </>
                  )}
                </div>);}}];

  return (
    <div className="space-y-8">
      {/* Tax Registrations */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Tax Registrations</h3>
          {!disabled && (
            <Button type="button" size="sm" onClick={openAddTax} className="gap-2">
              <Plus className="h-4 w-4" /> Add Tax Registration
            </Button>
          )}
        </div>

        {taxLoading ? <Skeleton className="h-20 w-full" /> : taxError ? <div role="alert"><p>Tax registrations could not be loaded.</p><Button type="button" onClick={refetchTax}>Try again</Button></div> : <ERPDataTable tableId={`party.tax:${partyId}`} resultsLabel="Tax registrations" data={taxRegs ?? []} columns={taxColumns} enableRowSelection={false}/>}

      </div>

      {/* Finance Profile */}
      <PartyFinanceProfileEditor partyId={partyId} authContext={authContext} disabled={parentDisabled} onBusyChange={onInlineTaskOpen} />

      {/* Tax Dialog */}
      {isDialogOpen && <PartyChildSaveDialog
        key={editingTax?.id ?? 'new'}
        formId={`party-tax-finance-tab:${partyId}`}
        record={editingTax}
        createAction={createPartyTaxRegistration}
        updateAction={updatePartyTaxRegistration}
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        title={editingTax ? "Edit Tax Registration" : "Add Tax Registration"}
        subtitle="Enter tax registration details for this party"
        icon={<Receipt className="h-5 w-5" />}
        mode={editingTax ? "edit" : "add"}
        size="lg"
        isSubmitting={isSubmittingTax}
        onSubmit={handleSubmitTax}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <RequiredLabel required>Tax Type</RequiredLabel>
            <TaxTypeSelect
              name="tax_type_id" ariaLabel="Tax Type" required
              value={taxForm.tax_type_id}
              onValueChange={(v) => setTaxForm((f) => ({ ...f, tax_type_id: v }))}
              placeholder="Select tax type..."
            />
          </div>
          <div className="col-span-6">
            <RequiredLabel required>Registration Number</RequiredLabel>
            <Input aria-label="Registration Number" required value={taxForm.tax_registration_number} onChange={(e) => setTaxForm((f) => ({ ...f, tax_registration_number: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <RequiredLabel required>Tax Status</RequiredLabel>
            <ERPCombobox ariaLabel="Tax Status"
              value={taxForm.tax_status_id}
              onValueChange={(v) => setTaxForm((f) => ({ ...f, tax_status_id: v !== null ? Number(v) : null }))}
              options={(taxStatuses ?? []).map((s) => ({ value: s.id, label: s.name_en }))}
              placeholder="Select status..."
              required
            />
          </div>
          <div className="col-span-6">
            <Label>Effective From</Label>
            <Input aria-label="Effective From" type="date" value={taxForm.effective_from} onChange={(e) => setTaxForm((f) => ({ ...f, effective_from: e.target.value }))} />
          </div>
          <div className="col-span-12 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Checkbox checked={taxForm.reverse_charge_applicable} onCheckedChange={(c) => setTaxForm((f) => ({ ...f, reverse_charge_applicable: !!c }))} />
              <Label>Reverse Charge</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={taxForm.vat_exempt} onCheckedChange={(c) => setTaxForm((f) => ({ ...f, vat_exempt: !!c }))} />
              <Label>VAT Exempt</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={taxForm.is_primary} onCheckedChange={(c) => setTaxForm((f) => ({ ...f, is_primary: !!c }))} />
              <Label>Primary</Label>
            </div>
          </div>
          <div className="col-span-12">
            <Label>Remarks</Label>
            <Textarea aria-label="Remarks" value={taxForm.remarks} onChange={(e) => setTaxForm((f) => ({ ...f, remarks: e.target.value }))} rows={2} />
          </div>
        </div>
      </PartyChildSaveDialog>}
      {lifecycle.dialog}
    </div>
  );
}
