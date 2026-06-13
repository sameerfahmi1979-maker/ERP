"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { LookupSelect } from "@/components/erp/lookup-select";
import { BankSelect } from "@/components/erp/finance-basics/bank-select";
import { CurrencySelect } from "@/components/erp/finance-basics/currency-select";
import { RequiredLabel } from "@/components/erp/required-label";
import type { CustomerBankDetail } from "@/features/master-data/customers/types";
import {
  deleteCustomerBankDetail,
  createCustomerBankDetail,
  updateCustomerBankDetail,
} from "@/server/actions/master-data/customer-bank-details";
import { useCustomerBankDetailsQuery } from "@/features/master-data/customers/hooks/use-customer-child-queries";
import { invalidateCustomerBankDetails } from "@/lib/query/invalidation";
import { prefetchLookupCategories } from "@/lib/query/prefetch-lookups";
import { Skeleton } from "@/components/ui/skeleton";

type CustomerBankDetailsSectionProps = {
  customerId: number;
  disabled?: boolean;
};

export function CustomerBankDetailsSection({ customerId, disabled }: CustomerBankDetailsSectionProps) {
  // 3B.6G.3 — TanStack Query keyed by ["child","customer_bank_details",customerId].
  // The drawer mounts this only after the Finance tab is first activated
  // AND a saved customer exists, so no fetch happens before that.
  const queryClient = useQueryClient();
  const { items: bankDetails, isLoading: loading, error: loadError } =
    useCustomerBankDetailsQuery(customerId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Prefetch BANK_ACCOUNT_TYPES lookup so the Add/Edit dialog feels instant.
  useEffect(() => {
    void prefetchLookupCategories(queryClient, ["BANK_ACCOUNT_TYPES"]);
  }, [queryClient]);
  const [editingBankDetail, setEditingBankDetail] = useState<CustomerBankDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    bank_id: null as number | null,
    bank_account_type_code: null as string | null,
    account_name: "",
    account_number: "",
    iban: "",
    swift_code: "",
    currency_id: null as number | null,
    is_primary: false,
    is_active: true,
    notes: "",
  });

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this bank detail?")) return;
    const result = await deleteCustomerBankDetail(id);
    if (result.success) {
      toast.success("Bank detail deleted");
      invalidateCustomerBankDetails(queryClient, customerId);
    } else {
      toast.error(result.error ?? "Failed to delete bank detail");
    }
  };

  const openAddDialog = () => {
    setEditingBankDetail(null);
    setFormData({
      bank_id: null,
      bank_account_type_code: null,
      account_name: "",
      account_number: "",
      iban: "",
      swift_code: "",
      currency_id: null,
      is_primary: false,
      is_active: true,
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (detail: CustomerBankDetail) => {
    setEditingBankDetail(detail);
    setFormData({
      bank_id: detail.bank_id,
      bank_account_type_code: detail.bank_account_type_code,
      account_name: detail.account_name,
      account_number: detail.account_number,
      iban: detail.iban || "",
      swift_code: detail.swift_code || "",
      currency_id: detail.currency_id,
      is_primary: detail.is_primary,
      is_active: detail.is_active,
      notes: detail.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        customer_id: customerId,
        bank_id: formData.bank_id,
        bank_account_type_code: formData.bank_account_type_code,
        account_name: formData.account_name,
        account_number: formData.account_number,
        iban: formData.iban || null,
        swift_code: formData.swift_code || null,
        currency_id: formData.currency_id,
        is_primary: formData.is_primary,
        is_active: formData.is_active,
        notes: formData.notes || null,
      };

      const result = editingBankDetail
        ? await updateCustomerBankDetail({ id: editingBankDetail.id, ...payload })
        : await createCustomerBankDetail(payload);

      if (result.success) {
        toast.success(editingBankDetail ? "Bank detail updated" : "Bank detail created");
        setIsDialogOpen(false);
        invalidateCustomerBankDetails(queryClient, customerId);
      } else {
        toast.error(result.error ?? "Failed to save bank detail");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="p-4 border rounded-md space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      ))}
    </div>
  );
  if (loadError) {
    return <div className="text-sm text-destructive">Failed to load bank details: {loadError}</div>;
  }

  return (
    <div>
      {!disabled && (
        <Button size="sm" className="mb-4" onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Bank Detail
        </Button>
      )}

      {bankDetails.length === 0 ? (
        <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-md">
          No bank details added yet
        </div>
      ) : (
        <div className="space-y-3">
          {bankDetails.map((detail) => (
            <div key={detail.id} className="p-4 border rounded-md">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4" />
                    <span className="font-medium">{detail.account_name}</span>
                    {detail.is_primary && <Badge variant="default" className="text-xs">Primary</Badge>}
                    {!detail.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  </div>
                  <div className="text-sm space-y-1">
                    <div className="font-mono">{detail.account_number}</div>
                    {detail.iban && <div className="text-muted-foreground">IBAN: {detail.iban}</div>}
                    {detail.swift_code && <div className="text-muted-foreground">SWIFT: {detail.swift_code}</div>}
                  </div>
                </div>
                {!disabled && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(detail)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(detail.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBankDetail ? "Edit Bank Detail" : "Add Bank Detail"}</DialogTitle>
            <DialogDescription>
              {editingBankDetail ? "Update bank account information" : "Add a new bank account for this customer"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="bank_id">Bank</Label>
                <BankSelect
                  value={formData.bank_id}
                  onValueChange={(v: number | null) => setFormData({ ...formData, bank_id: v })}
                />
              </div>

              <div>
                <Label htmlFor="bank_account_type_code">Account Type</Label>
                <LookupSelect
                  categoryCode="BANK_ACCOUNT_TYPES"
                  value={formData.bank_account_type_code}
                  onValueChange={(v) => setFormData({ ...formData, bank_account_type_code: v as string | null })}
                  valueField="code"
                />
              </div>

              <div className="col-span-2">
                <RequiredLabel htmlFor="account_name" required={true}>Account Name</RequiredLabel>
                <Input
                  id="account_name"
                  value={formData.account_name}
                  onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                  required
                />
              </div>

              <div>
                <RequiredLabel htmlFor="account_number" required={true}>Account Number</RequiredLabel>
                <Input
                  id="account_number"
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  required
                  className="font-mono"
                />
              </div>

              <div>
                <Label htmlFor="currency_id">Currency</Label>
                <CurrencySelect
                  value={formData.currency_id}
                  onValueChange={(v: number | null) => setFormData({ ...formData, currency_id: v })}
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="iban">IBAN</Label>
                <Input
                  id="iban"
                  value={formData.iban}
                  onChange={(e) => setFormData({ ...formData, iban: e.target.value.toUpperCase() })}
                  className="font-mono"
                  placeholder="AE000000000000000000000"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="swift_code">SWIFT Code</Label>
                <Input
                  id="swift_code"
                  value={formData.swift_code}
                  onChange={(e) => setFormData({ ...formData, swift_code: e.target.value.toUpperCase() })}
                  className="font-mono"
                  placeholder="XXXXXXXX or XXXXXXXXXXX"
                  maxLength={11}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Flags</Label>
              <div className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_primary"
                    checked={formData.is_primary}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_primary: !!checked })}
                  />
                  <Label htmlFor="is_primary" className="font-normal">Primary Bank Account</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: !!checked })}
                  />
                  <Label htmlFor="is_active" className="font-normal">Active</Label>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingBankDetail ? "Update Bank Detail" : "Add Bank Detail"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
