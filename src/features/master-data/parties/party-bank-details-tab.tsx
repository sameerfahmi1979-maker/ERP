"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, Trash2, ShieldCheck, Lock, Landmark, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { RequiredLabel } from "@/components/erp/required-label";
import { checkDuplicateIban } from "@/server/actions/master-data/parties";
import { CurrencySelect, BankSelect } from "@/components/erp/finance-basics";
import { CountrySelect } from "@/components/erp/geography";
import { usePartyBankDetailsQuery } from "./hooks/use-party-child-queries";
import { useBanksQuery } from "@/hooks/lookups";
import { invalidatePartyBankDetails } from "@/lib/query/invalidation";
import { useRealtimeSync } from "@/hooks/realtime/use-realtime-sync";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  createPartyBankDetail,
  updatePartyBankDetail,
  deletePartyBankDetail,
  verifyPartyBankDetail,
} from "@/server/actions/master-data/party-bank-details";
import type { PartyBankDetail } from "./party-types";
import type { AuthContext } from "@/lib/rbac/check";

type PartyBankDetailsTabProps = {
  partyId: number;
  disabled?: boolean;
  authContext: AuthContext;
  onChildOpen?: (open: boolean) => void;
};

const emptyForm = {
  bank_id: null as number | null,
  bank_name_text: "",
  account_holder_name: "",
  account_number: "",
  iban: "",
  swift_code: "",
  currency_id: null as number | null,
  branch_name: "",
  country_id: null as number | null,
  is_primary: false,
  is_active: true,
  remarks: "",
};

export function PartyBankDetailsTab({ partyId, disabled, authContext, onChildOpen }: PartyBankDetailsTabProps) {
  const queryClient = useQueryClient();
  const { openTab } = useWorkspace();
  const canView = authContext.permissionCodes?.includes("master_data.parties.view_bank_details") ||
    authContext.permissionCodes?.includes("master_data.parties.manage_bank_details");
  const canManage = authContext.permissionCodes?.includes("master_data.parties.manage_bank_details");
  const canVerify = authContext.permissionCodes?.includes("master_data.parties.verify_bank_details");

  // Finance Banks lookup for the bank selector
  const { options: bankOptions } = useBanksQuery();

  const { items: bankDetails, isLoading } = usePartyBankDetailsQuery(canView ? partyId : null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const setDialogOpen = (open: boolean) => { setIsDialogOpen(open); onChildOpen?.(open); };
  const [editing, setEditing] = useState<PartyBankDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  // ERP REALTIME.1B — scoped live sync for this party's bank details.
  // Subscription is suppressed while a child dialog is open to protect unsaved form data.
  // Bank details are permission-gated — subscription also gated on canView.
  useRealtimeSync({
    table: "party_bank_details",
    event: "*",
    filter: `party_id=eq.${partyId}`,
    enabled: canView && !isDialogOpen,
    debounceMs: 400,
    onEvent: () => {
      invalidatePartyBankDetails(queryClient, partyId);
    },
  });
  const [ibanWarning, setIbanWarning] = useState<string | null>(null);

  if (!canView) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        <Lock className="h-4 w-4 shrink-0" />
        You do not have permission to view bank details.
      </div>
    );
  }

  const handleIbanChange = async (value: string) => {
    setForm((f) => ({ ...f, iban: value }));
    setIbanWarning(null);
    if (value.trim().length > 10) {
      const result = await checkDuplicateIban(value, editing?.id ?? null);
      if (result.success && result.data?.isDuplicate) {
        const names = result.data.existingParties.map((p) => `${p.party_code} – ${p.display_name}`).join(", ");
        setIbanWarning(`This IBAN is already assigned to: ${names}. Please confirm before saving.`);
      }
    }
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setIbanWarning(null);
    setDialogOpen(true);
  };

  const openEdit = (item: PartyBankDetail) => {
    setEditing(item);
    setIbanWarning(null);
    setForm({
      bank_id: item.bank_id,
      bank_name_text: item.bank_name_text ?? "",
      account_holder_name: item.account_holder_name,
      account_number: item.account_number ?? "",
      iban: item.iban ?? "",
      swift_code: item.swift_code ?? "",
      currency_id: item.currency_id,
      branch_name: item.branch_name ?? "",
      country_id: item.country_id,
      is_primary: item.is_primary,
      is_active: item.is_active,
      remarks: item.remarks ?? "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!canManage) return;
    if (!confirm("Delete this bank detail?")) return;
    const result = await deletePartyBankDetail(id);
    if (result.success) {
      toast.success("Bank detail deleted");
      invalidatePartyBankDetails(queryClient, partyId);
    } else {
      toast.error(result.error ?? "Failed to delete");
    }
  };

  const handleVerify = async (id: number) => {
    if (!canVerify) return;
    const result = await verifyPartyBankDetail(id);
    if (result.success) {
      toast.success("Bank detail verified");
      invalidatePartyBankDetails(queryClient, partyId);
    } else {
      toast.error(result.error ?? "Failed to verify");
    }
  };

  const handleSubmit = async () => {
    if (!form.account_holder_name) {
      toast.error("Account holder name is required");
      return;
    }
    if (!canManage) return;
    setIsSubmitting(true);
    try {
      const payload = {
        party_id: partyId,
        bank_id: form.bank_id,
        bank_name_text: form.bank_name_text || null,
        account_holder_name: form.account_holder_name,
        account_number: form.account_number || null,
        iban: form.iban || null,
        swift_code: form.swift_code || null,
        currency_id: form.currency_id,
        branch_name: form.branch_name || null,
        country_id: form.country_id,
        is_primary: form.is_primary,
        is_active: form.is_active,
        remarks: form.remarks || null,
      };

      const result = editing
        ? await updatePartyBankDetail({ id: editing.id, ...payload })
        : await createPartyBankDetail(payload);

      if (result.success) {
        toast.success(`Bank detail ${editing ? "updated" : "added"}`);
        setDialogOpen(false);
        invalidatePartyBankDetails(queryClient, partyId);
      } else {
        toast.error(result.error ?? "Failed to save bank detail");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Lock className="h-3.5 w-3.5" />
          Bank details are access-controlled and sensitive.
        </p>
        {!disabled && canManage && (
          <Button type="button" size="sm" onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" /> Add Bank Detail
          </Button>
        )}
      </div>

      {(bankDetails ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No bank details added yet.</p>
      ) : (
        <div className="space-y-2">
          {(bankDetails ?? []).map((bank) => (
            <div key={bank.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground">{bank.bank_detail_code}</span>
                  {bank.is_primary && <Badge className="text-xs">Primary</Badge>}
                  {bank.is_verified && <Badge variant="outline" className="text-xs text-green-700 border-green-400">Verified</Badge>}
                  {!bank.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                </div>
                <div className="font-medium text-sm">{bank.account_holder_name}</div>
                <div className="text-xs text-muted-foreground">
                  {(bank.bank_name ?? bank.bank_name_text) && `${bank.bank_name ?? bank.bank_name_text} · `}
                  {bank.iban && <span>IBAN: {bank.iban}</span>}
                  {bank.currency_code && <span> · {bank.currency_code}</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {canVerify && !bank.is_verified && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-green-600" title="Verify" onClick={() => handleVerify(bank.id)}>
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </Button>
                )}
                {!disabled && canManage && (
                  <>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(bank)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(bank.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Bank Detail" : "Add Bank Detail"}
        subtitle="Enter bank account information"
        icon={<Landmark className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="lg"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          {/* ── Bank selection from Finance Banks (source of truth) ── */}
          <div className="col-span-10">
            <Label>Bank</Label>
            <BankSelect
              value={form.bank_id}
              onValueChange={(v) => {
                const selected = bankOptions.find((o) => o.value === v);
                setForm((f) => ({
                  ...f,
                  bank_id: v,
                  bank_name_text: selected ? selected.label : f.bank_name_text,
                }));
              }}
              placeholder="Select from Finance Banks..."
              allowClear
            />
          </div>
          <div className="col-span-2 flex items-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1 text-xs"
              title="Open Finance Banks to add a new bank"
              onClick={() => {
                openTab({
                  route: "/admin/master-data/finance-basics/banks/record/new",
                  title: "New Bank",
                  tabKind: "record",
                  entityType: "bank",
                  formMode: "add",
                  closable: true,
                });
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              New Bank
            </Button>
          </div>

          {/* Read-only bank master info when a Finance Bank is selected */}
          {form.bank_id && (() => {
            const bank = bankOptions.find((o) => o.value === form.bank_id);
            if (!bank) return null;
            return (
              <div className="col-span-12 rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                <div className="font-medium text-foreground text-sm">{bank.label}</div>
                {bank.code && <div>Code: <span className="font-mono">{bank.code}</span></div>}
                {bank.description && <div>Short Name: {bank.description}</div>}
              </div>
            );
          })()}

          {/* Manual bank name fallback — for banks not yet in Finance Banks */}
          {!form.bank_id && (
            <div className="col-span-12">
              <Label className="text-muted-foreground text-xs">Or enter bank name manually (if not in Finance Banks)</Label>
              <Input value={form.bank_name_text} onChange={(e) => setForm((f) => ({ ...f, bank_name_text: e.target.value }))} placeholder="Enter bank name" />
            </div>
          )}

          <div className="col-span-12">
            <RequiredLabel required>Account Holder Name</RequiredLabel>
            <Input value={form.account_holder_name} onChange={(e) => setForm((f) => ({ ...f, account_holder_name: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Account Number</Label>
            <Input value={form.account_number} onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>IBAN</Label>
            <Input
              value={form.iban}
              onChange={(e) => handleIbanChange(e.target.value)}
              className="font-mono"
            />
            {ibanWarning && (
              <p className="mt-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                ⚠️ {ibanWarning}
              </p>
            )}
          </div>
          <div className="col-span-6">
            <Label>SWIFT Code</Label>
            <Input value={form.swift_code} onChange={(e) => setForm((f) => ({ ...f, swift_code: e.target.value }))} className="font-mono" />
          </div>
          <div className="col-span-6">
            <Label>Branch Name</Label>
            <Input value={form.branch_name} onChange={(e) => setForm((f) => ({ ...f, branch_name: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Currency</Label>
            <CurrencySelect value={form.currency_id} onValueChange={(v) => setForm((f) => ({ ...f, currency_id: v }))} />
          </div>
          <div className="col-span-6">
            <Label>Country</Label>
            <CountrySelect value={form.country_id} onValueChange={(v) => setForm((f) => ({ ...f, country_id: v }))} />
          </div>
          <div className="col-span-12 flex gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="bank_primary" checked={form.is_primary} onCheckedChange={(c) => setForm((f) => ({ ...f, is_primary: !!c }))} />
              <Label htmlFor="bank_primary">Primary</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="bank_active" checked={form.is_active} onCheckedChange={(c) => setForm((f) => ({ ...f, is_active: !!c }))} />
              <Label htmlFor="bank_active">Active</Label>
            </div>
          </div>
          <div className="col-span-12">
            <Label>Remarks</Label>
            <Textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
