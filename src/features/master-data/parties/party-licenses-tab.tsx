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
import { Plus, Edit, Trash2, AlertTriangle, BadgeCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format, isPast, isWithinInterval, addDays } from "date-fns";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { RequiredLabel } from "@/components/erp/required-label";
import { PartySelect } from "@/components/erp/party-select";
import { usePartyLicensesQuery } from "./hooks/use-party-child-queries";
import { invalidatePartyLicenses } from "@/lib/query/invalidation";
import {
  createPartyLicense,
  updatePartyLicense,
  deletePartyLicense,
} from "@/server/actions/master-data/party-licenses";
import {
  getPartyLicenseTypes,
  getPartyLicenseStatuses,
} from "@/server/actions/master-data/parties";
import type { PartyLicense } from "./party-types";
import { useQuery } from "@tanstack/react-query";
import { ERPCombobox } from "@/components/erp/combobox";
import { CountrySelect, EmirateSelect } from "@/components/erp/geography";

type PartyLicensesTabProps = {
  partyId: number;
  disabled?: boolean;
  onChildOpen?: (open: boolean) => void;
};

const emptyForm = {
  license_type_id: null as number | null,
  license_number: "",
  license_name: "",
  issuing_authority_party_id: null as number | null,
  issuing_country_id: null as number | null,
  issuing_emirate_id: null as number | null,
  issue_date: "",
  expiry_date: "",
  renewal_required: false,
  renewal_notice_days: "" as string,
  license_status_id: null as number | null,
  license_activity_text: "",
  is_primary: false,
  is_active: true,
  remarks: "",
};

export function PartyLicensesTab({ partyId, disabled, onChildOpen }: PartyLicensesTabProps) {
  const queryClient = useQueryClient();
  const { items: licenses, isLoading } = usePartyLicensesQuery(partyId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const setDialogOpen = (open: boolean) => { setIsDialogOpen(open); onChildOpen?.(open); };
  const [editing, setEditing] = useState<PartyLicense | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: licenseTypes } = useQuery({
    queryKey: ["party_license_types"],
    queryFn: async () => (await getPartyLicenseTypes()).data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: licenseStatuses } = useQuery({
    queryKey: ["party_license_statuses"],
    queryFn: async () => (await getPartyLicenseStatuses()).data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (item: PartyLicense) => {
    setEditing(item);
    setForm({
      license_type_id: item.license_type_id,
      license_number: item.license_number,
      license_name: item.license_name ?? "",
      issuing_authority_party_id: item.issuing_authority_party_id,
      issuing_country_id: item.issuing_country_id,
      issuing_emirate_id: item.issuing_emirate_id,
      issue_date: item.issue_date ?? "",
      expiry_date: item.expiry_date ?? "",
      renewal_required: item.renewal_required,
      renewal_notice_days: item.renewal_notice_days ? String(item.renewal_notice_days) : "",
      license_status_id: item.license_status_id,
      license_activity_text: item.license_activity_text ?? "",
      is_primary: item.is_primary,
      is_active: item.is_active,
      remarks: item.remarks ?? "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this license?")) return;
    const result = await deletePartyLicense(id);
    if (result.success) {
      toast.success("License deleted");
      invalidatePartyLicenses(queryClient, partyId);
    } else {
      toast.error(result.error ?? "Failed to delete");
    }
  };

  const handleSubmit = async () => {
    if (!form.license_type_id || !form.license_number || !form.license_status_id) {
      toast.error("Please fill in all required fields");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        party_id: partyId,
        license_type_id: form.license_type_id!,
        license_number: form.license_number,
        license_name: form.license_name || null,
        issuing_authority_party_id: form.issuing_authority_party_id,
        issuing_country_id: form.issuing_country_id,
        issuing_emirate_id: form.issuing_emirate_id,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        renewal_required: form.renewal_required,
        renewal_notice_days: form.renewal_notice_days ? parseInt(form.renewal_notice_days) : null,
        license_status_id: form.license_status_id!,
        license_activity_text: form.license_activity_text || null,
        is_primary: form.is_primary,
        is_active: form.is_active,
        remarks: form.remarks || null,
      };

      let result;
      if (editing) {
        result = await updatePartyLicense({ id: editing.id, ...payload });
      } else {
        result = await createPartyLicense(payload);
      }

      if (result.success) {
        toast.success(`License ${editing ? "updated" : "added"}`);
        setDialogOpen(false);
        invalidatePartyLicenses(queryClient, partyId);
      } else {
        toast.error(result.error ?? "Failed to save license");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getExpiryBadge = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    const date = new Date(expiryDate);
    if (isPast(date)) return <Badge variant="destructive" className="text-xs">Expired</Badge>;
    const soon = isWithinInterval(date, { start: new Date(), end: addDays(new Date(), 30) });
    if (soon) return <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">Expiring Soon</Badge>;
    return null;
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-4">
      {!disabled && (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" /> Add License
          </Button>
        </div>
      )}

      {(licenses ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No licenses added yet.</p>
      ) : (
        <div className="space-y-2">
          {(licenses ?? []).map((lic) => (
            <div key={lic.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground">{lic.license_code}</span>
                  {lic.is_primary && <Badge className="text-xs">Primary</Badge>}
                  {!lic.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  {getExpiryBadge(lic.expiry_date)}
                </div>
                <div className="font-medium text-sm">{lic.license_number}</div>
                <div className="text-xs text-muted-foreground">
                  {lic.license_type_name && <span>{lic.license_type_name} · </span>}
                  {lic.expiry_date && <span>Expires: {format(new Date(lic.expiry_date), "dd MMM yyyy")}</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {lic.dms_license_document_id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => window.open(`/dms/documents/record/${lic.dms_license_document_id}`, "_blank")}
                    title="Open document in DMS"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open in DMS
                  </Button>
                )}
                {!disabled && (
                  <>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(lic)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(lic.id)}>
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
        title={editing ? "Edit License" : "Add License"}
        subtitle="Enter license details for this party"
        icon={<BadgeCheck className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="lg"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <RequiredLabel htmlFor="lic_type" required>License Type</RequiredLabel>
            <ERPCombobox
              value={form.license_type_id}
              onValueChange={(v) => setForm((f) => ({ ...f, license_type_id: v !== null ? Number(v) : null }))}
              options={(licenseTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }))}
              placeholder="Select type..."
              required
            />
          </div>
          <div className="col-span-6">
            <RequiredLabel htmlFor="lic_number" required>License Number</RequiredLabel>
            <Input id="lic_number" value={form.license_number} onChange={(e) => setForm((f) => ({ ...f, license_number: e.target.value }))} />
          </div>
          <div className="col-span-12">
            <Label>License Name</Label>
            <Input value={form.license_name} onChange={(e) => setForm((f) => ({ ...f, license_name: e.target.value }))} />
          </div>
          <div className="col-span-12">
            <Label>Issuing Authority</Label>
            <PartySelect
              value={form.issuing_authority_party_id}
              onValueChange={(v) => setForm((f) => ({ ...f, issuing_authority_party_id: v }))}
              typeCodes={["GOVERNMENT_AUTHORITY", "LICENSE_ISSUER", "FREE_ZONE_AUTHORITY"]}
              placeholder="Select issuing authority..."
              allowClear
            />
          </div>
          <div className="col-span-6">
            <Label>Issuing Country</Label>
            <CountrySelect value={form.issuing_country_id} onValueChange={(v) => setForm((f) => ({ ...f, issuing_country_id: v, issuing_emirate_id: null }))} />
          </div>
          <div className="col-span-6">
            <Label>Issuing Emirate</Label>
            <EmirateSelect countryId={form.issuing_country_id} value={form.issuing_emirate_id} onValueChange={(v) => setForm((f) => ({ ...f, issuing_emirate_id: v }))} disabled={!form.issuing_country_id} />
          </div>
          <div className="col-span-6">
            <Label>Issue Date</Label>
            <Input type="date" value={form.issue_date} onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Expiry Date</Label>
            <Input type="date" value={form.expiry_date} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <RequiredLabel htmlFor="lic_status" required>Status</RequiredLabel>
            <ERPCombobox
              value={form.license_status_id}
              onValueChange={(v) => setForm((f) => ({ ...f, license_status_id: v !== null ? Number(v) : null }))}
              options={(licenseStatuses ?? []).map((s) => ({ value: s.id, label: s.name_en }))}
              placeholder="Select status..."
              required
            />
          </div>
          <div className="col-span-6 flex items-end gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="lic_primary" checked={form.is_primary} onCheckedChange={(c) => setForm((f) => ({ ...f, is_primary: !!c }))} />
              <Label htmlFor="lic_primary">Primary</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="lic_active" checked={form.is_active} onCheckedChange={(c) => setForm((f) => ({ ...f, is_active: !!c }))} />
              <Label htmlFor="lic_active">Active</Label>
            </div>
          </div>
          <div className="col-span-12">
            <Label>Activity Text</Label>
            <Textarea value={form.license_activity_text} onChange={(e) => setForm((f) => ({ ...f, license_activity_text: e.target.value }))} rows={2} />
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
