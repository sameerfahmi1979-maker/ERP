"use client";

import { useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, Trash2, Receipt, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { RequiredLabel } from "@/components/erp/required-label";
import { CurrencySelect, PaymentTermSelect, TaxTypeSelect } from "@/components/erp/finance-basics";
import { usePartyTaxRegistrationsQuery } from "./hooks/use-party-child-queries";
import { invalidatePartyTaxRegistrations } from "@/lib/query/invalidation";
import {
  createPartyTaxRegistration,
  updatePartyTaxRegistration,
  deletePartyTaxRegistration,
} from "@/server/actions/master-data/party-tax-registrations";
import {
  getPartyTaxStatuses,
  getPaymentMethods,
} from "@/server/actions/master-data/parties";
import { getPartyFinanceProfile, upsertPartyFinanceProfile } from "@/server/actions/master-data/party-finance-profiles";
import type { PartyTaxRegistration } from "./party-types";

type PartyTaxFinanceTabProps = {
  partyId: number;
  disabled?: boolean;
  onChildOpen?: (open: boolean) => void;
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

export function PartyTaxFinanceTab({ partyId, disabled, onChildOpen }: PartyTaxFinanceTabProps) {
  const queryClient = useQueryClient();
  const { items: taxRegs, isLoading: taxLoading } = usePartyTaxRegistrationsQuery(partyId);

  // Finance profile state
  const [financeProfile, setFinanceProfile] = useState({
    default_currency_id: null as number | null,
    default_payment_term_id: null as number | null,
    default_payment_method_id: null as number | null,
    credit_limit: "" as string,
    credit_currency_id: null as number | null,
    finance_hold: false,
    finance_hold_reason: "",
    finance_remarks: "",
  });
  const [financeLoaded, setFinanceLoaded] = useState(false);
  const [isSavingFinance, setIsSavingFinance] = useState(false);

  // Tax dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const setDialogOpen = (open: boolean) => { setIsDialogOpen(open); onChildOpen?.(open); };
  const [editingTax, setEditingTax] = useState<PartyTaxRegistration | null>(null);
  const [taxForm, setTaxForm] = useState({ ...emptyTaxForm });
  const [isSubmittingTax, setIsSubmittingTax] = useState(false);

  const { data: taxStatuses } = useQuery({
    queryKey: ["party_tax_statuses"],
    queryFn: async () => (await getPartyTaxStatuses()).data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ["payment_methods"],
    queryFn: async () => (await getPaymentMethods()).data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  // Load finance profile
  useEffect(() => {
    if (!partyId) return;
    getPartyFinanceProfile(partyId).then((result) => {
      if (result.success && result.data) {
        const p = result.data;
        setFinanceProfile({
          default_currency_id: p.default_currency_id,
          default_payment_term_id: p.default_payment_term_id,
          default_payment_method_id: p.default_payment_method_id,
          credit_limit: p.credit_limit ? String(p.credit_limit) : "",
          credit_currency_id: p.credit_currency_id,
          finance_hold: p.finance_hold,
          finance_hold_reason: p.finance_hold_reason ?? "",
          finance_remarks: p.finance_remarks ?? "",
        });
      }
      setFinanceLoaded(true);
    });
  }, [partyId]);

  const handleSaveFinance = async () => {
    setIsSavingFinance(true);
    try {
      const result = await upsertPartyFinanceProfile({
        party_id: partyId,
        default_currency_id: financeProfile.default_currency_id,
        default_payment_term_id: financeProfile.default_payment_term_id,
        default_payment_method_id: financeProfile.default_payment_method_id,
        credit_limit: financeProfile.credit_limit ? parseFloat(financeProfile.credit_limit) : null,
        credit_currency_id: financeProfile.credit_currency_id,
        finance_hold: financeProfile.finance_hold,
        finance_hold_reason: financeProfile.finance_hold_reason || null,
        finance_remarks: financeProfile.finance_remarks || null,
      });
      if (result.success) toast.success("Finance profile saved");
      else toast.error(result.error ?? "Failed to save");
    } finally {
      setIsSavingFinance(false);
    }
  };

  const openAddTax = () => {
    setEditingTax(null);
    setTaxForm({ ...emptyTaxForm });
    setDialogOpen(true);
  };

  const openEditTax = (item: PartyTaxRegistration) => {
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

  const handleDeleteTax = async (id: number) => {
    if (!confirm("Delete this tax registration?")) return;
    const result = await deletePartyTaxRegistration(id);
    if (result.success) {
      toast.success("Tax registration deleted");
      invalidatePartyTaxRegistrations(queryClient, partyId);
    } else {
      toast.error(result.error ?? "Failed to delete");
    }
  };

  const handleSubmitTax = async () => {
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
      const result = editingTax
        ? await updatePartyTaxRegistration({ id: editingTax.id, ...payload })
        : await createPartyTaxRegistration(payload);

      if (result.success) {
        toast.success(`Tax registration ${editingTax ? "updated" : "added"}`);
        setDialogOpen(false);
        invalidatePartyTaxRegistrations(queryClient, partyId);
      } else {
        toast.error(result.error ?? "Failed to save");
      }
    } finally {
      setIsSubmittingTax(false);
    }
  };

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

        {taxLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (taxRegs ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No tax registrations added yet.</p>
        ) : (
          <div className="space-y-2">
            {(taxRegs ?? []).map((tax) => (
              <div key={tax.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div className="space-y-1">
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
                </div>
                <div className="flex gap-1 shrink-0">
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
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTax(tax)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteTax(tax.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Finance Profile */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Finance Profile</h3>
        {!financeLoaded ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6">
              <Label>Default Currency</Label>
              <CurrencySelect value={financeProfile.default_currency_id} onValueChange={(v) => setFinanceProfile((f) => ({ ...f, default_currency_id: v }))} disabled={disabled} />
            </div>
            <div className="col-span-6">
              <Label>Default Payment Term</Label>
              <PaymentTermSelect value={financeProfile.default_payment_term_id} onValueChange={(v) => setFinanceProfile((f) => ({ ...f, default_payment_term_id: v }))} disabled={disabled} />
            </div>
            <div className="col-span-6">
              <Label>Default Payment Method</Label>
              <ERPCombobox
                value={financeProfile.default_payment_method_id}
                onValueChange={(v) => setFinanceProfile((f) => ({ ...f, default_payment_method_id: v !== null ? Number(v) : null }))}
                options={(paymentMethods ?? []).map((m) => ({ value: m.id, label: m.name_en }))}
                placeholder="Select payment method..."
                disabled={disabled}
                allowClear
              />
            </div>
            <div className="col-span-3">
              <Label>Credit Limit</Label>
              <Input type="number" step="0.01" min="0" value={financeProfile.credit_limit} onChange={(e) => setFinanceProfile((f) => ({ ...f, credit_limit: e.target.value }))} disabled={disabled} />
            </div>
            <div className="col-span-3">
              <Label>Credit Currency</Label>
              <CurrencySelect value={financeProfile.credit_currency_id} onValueChange={(v) => setFinanceProfile((f) => ({ ...f, credit_currency_id: v }))} disabled={disabled} />
            </div>
            <div className="col-span-6 flex items-end gap-3 pb-1">
              <Label>Finance Hold</Label>
              <Switch checked={financeProfile.finance_hold} onCheckedChange={(c) => setFinanceProfile((f) => ({ ...f, finance_hold: c }))} disabled={disabled} />
              <span className="text-sm text-muted-foreground">{financeProfile.finance_hold ? "Yes" : "No"}</span>
            </div>
            {financeProfile.finance_hold && (
              <div className="col-span-6">
                <Label>Finance Hold Reason</Label>
                <Input value={financeProfile.finance_hold_reason} onChange={(e) => setFinanceProfile((f) => ({ ...f, finance_hold_reason: e.target.value }))} disabled={disabled} required />
              </div>
            )}
            <div className="col-span-12">
              <Label>Finance Remarks</Label>
              <Textarea value={financeProfile.finance_remarks} onChange={(e) => setFinanceProfile((f) => ({ ...f, finance_remarks: e.target.value }))} rows={2} disabled={disabled} />
            </div>
            {!disabled && (
              <div className="col-span-12 flex justify-end">
                <Button type="button" size="sm" onClick={handleSaveFinance} disabled={isSavingFinance}>
                  {isSavingFinance ? "Saving..." : "Save Finance Profile"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tax Dialog */}
      <ERPChildDialogForm
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
              value={taxForm.tax_type_id}
              onValueChange={(v) => setTaxForm((f) => ({ ...f, tax_type_id: v }))}
              placeholder="Select tax type..."
            />
          </div>
          <div className="col-span-6">
            <RequiredLabel required>Registration Number</RequiredLabel>
            <Input value={taxForm.tax_registration_number} onChange={(e) => setTaxForm((f) => ({ ...f, tax_registration_number: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <RequiredLabel required>Tax Status</RequiredLabel>
            <ERPCombobox
              value={taxForm.tax_status_id}
              onValueChange={(v) => setTaxForm((f) => ({ ...f, tax_status_id: v !== null ? Number(v) : null }))}
              options={(taxStatuses ?? []).map((s) => ({ value: s.id, label: s.name_en }))}
              placeholder="Select status..."
              required
            />
          </div>
          <div className="col-span-6">
            <Label>Effective From</Label>
            <Input type="date" value={taxForm.effective_from} onChange={(e) => setTaxForm((f) => ({ ...f, effective_from: e.target.value }))} />
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
            <Textarea value={taxForm.remarks} onChange={(e) => setTaxForm((f) => ({ ...f, remarks: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
