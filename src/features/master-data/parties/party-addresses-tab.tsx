"use client";

import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, Trash2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { RequiredLabel } from "@/components/erp/required-label";
import { CountrySelect, EmirateSelect, CitySelect, AreaZoneSelect } from "@/components/erp/geography";
import { usePartyAddressesQuery } from "./hooks/use-party-child-queries";
import { invalidatePartyAddresses } from "@/lib/query/invalidation";
import {
  createPartyAddress,
  updatePartyAddress,
  deletePartyAddress,
} from "@/server/actions/master-data/party-addresses";
import { getPartyAddressTypes } from "@/server/actions/master-data/parties";
import type { PartyAddress } from "./party-types";

type PartyAddressesTabProps = {
  partyId: number;
  disabled?: boolean;
  onChildOpen?: (open: boolean) => void;
};

const emptyForm = {
  address_type_id: null as number | null,
  address_name: "",
  country_id: null as number | null,
  emirate_id: null as number | null,
  city_id: null as number | null,
  area_zone_id: null as number | null,
  street: "",
  building: "",
  floor: "",
  office_no: "",
  po_box: "",
  landmark: "",
  google_map_url: "",
  is_primary: false,
  is_billing_address: false,
  is_shipping_address: false,
  is_site_address: false,
  is_active: true,
  notes: "",
};

export function PartyAddressesTab({ partyId, disabled, onChildOpen }: PartyAddressesTabProps) {
  const queryClient = useQueryClient();
  const { items: addresses, isLoading } = usePartyAddressesQuery(partyId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const setDialogOpen = (open: boolean) => { setIsDialogOpen(open); onChildOpen?.(open); };
  const [editing, setEditing] = useState<PartyAddress | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: addressTypes } = useQuery({
    queryKey: ["party_address_types"],
    queryFn: async () => (await getPartyAddressTypes()).data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (item: PartyAddress) => {
    setEditing(item);
    setForm({
      address_type_id: item.address_type_id,
      address_name: item.address_name ?? "",
      country_id: item.country_id,
      emirate_id: item.emirate_id,
      city_id: item.city_id,
      area_zone_id: item.area_zone_id,
      street: item.street ?? "",
      building: item.building ?? "",
      floor: item.floor ?? "",
      office_no: item.office_no ?? "",
      po_box: item.po_box ?? "",
      landmark: item.landmark ?? "",
      google_map_url: item.google_map_url ?? "",
      is_primary: item.is_primary,
      is_billing_address: item.is_billing_address,
      is_shipping_address: item.is_shipping_address,
      is_site_address: item.is_site_address,
      is_active: item.is_active,
      notes: item.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this address?")) return;
    const result = await deletePartyAddress(id);
    if (result.success) {
      toast.success("Address deleted");
      invalidatePartyAddresses(queryClient, partyId);
    } else {
      toast.error(result.error ?? "Failed to delete");
    }
  };

  const handleSubmit = async () => {
    if (!form.address_type_id || !form.country_id) {
      toast.error("Address type and country are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        party_id: partyId,
        address_type_id: form.address_type_id!,
        address_name: form.address_name || null,
        country_id: form.country_id!,
        emirate_id: form.emirate_id,
        city_id: form.city_id,
        area_zone_id: form.area_zone_id,
        street: form.street || null,
        building: form.building || null,
        floor: form.floor || null,
        office_no: form.office_no || null,
        po_box: form.po_box || null,
        landmark: form.landmark || null,
        google_map_url: form.google_map_url || null,
        latitude: null,
        longitude: null,
        is_primary: form.is_primary,
        is_billing_address: form.is_billing_address,
        is_shipping_address: form.is_shipping_address,
        is_site_address: form.is_site_address,
        is_active: form.is_active,
        notes: form.notes || null,
      };

      const result = editing
        ? await updatePartyAddress({ id: editing.id, ...payload })
        : await createPartyAddress(payload);

      if (result.success) {
        toast.success(`Address ${editing ? "updated" : "added"}`);
        setDialogOpen(false);
        invalidatePartyAddresses(queryClient, partyId);
      } else {
        toast.error(result.error ?? "Failed to save address");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-4">
      {!disabled && (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" /> Add Address
          </Button>
        </div>
      )}

      {(addresses ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No addresses added yet.</p>
      ) : (
        <div className="space-y-2">
          {(addresses ?? []).map((addr) => (
            <div key={addr.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground">{addr.address_code}</span>
                  {addr.is_primary && <Badge className="text-xs">Primary</Badge>}
                  {addr.is_billing_address && <Badge variant="outline" className="text-xs">Billing</Badge>}
                  {addr.is_shipping_address && <Badge variant="outline" className="text-xs">Shipping</Badge>}
                  {addr.is_site_address && <Badge variant="outline" className="text-xs">Site</Badge>}
                </div>
                <div className="text-sm">
                  {addr.address_name && <span className="font-medium">{addr.address_name} — </span>}
                  <span className="text-muted-foreground">
                    {[addr.city_name, addr.emirate_name, addr.country_name].filter(Boolean).join(", ")}
                  </span>
                </div>
              </div>
              {!disabled && (
                <div className="flex gap-1 shrink-0">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(addr)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(addr.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Address" : "Add Address"}
        subtitle="Enter address details for this party"
        icon={<MapPin className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="lg"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <RequiredLabel required>Address Type</RequiredLabel>
            <ERPCombobox
              value={form.address_type_id}
              onValueChange={(v) => setForm((f) => ({ ...f, address_type_id: v !== null ? Number(v) : null }))}
              options={(addressTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }))}
              placeholder="Select type..."
              required
            />
          </div>
          <div className="col-span-6">
            <Label>Address Name / Label</Label>
            <Input value={form.address_name} onChange={(e) => setForm((f) => ({ ...f, address_name: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <RequiredLabel required>Country</RequiredLabel>
            <CountrySelect value={form.country_id} onValueChange={(v) => setForm((f) => ({ ...f, country_id: v, emirate_id: null, city_id: null, area_zone_id: null }))} />
          </div>
          <div className="col-span-6">
            <Label>Emirate</Label>
            <EmirateSelect countryId={form.country_id} value={form.emirate_id} onValueChange={(v) => setForm((f) => ({ ...f, emirate_id: v, city_id: null, area_zone_id: null }))} disabled={!form.country_id} />
          </div>
          <div className="col-span-6">
            <Label>City</Label>
            <CitySelect emirateId={form.emirate_id} value={form.city_id} onValueChange={(v) => setForm((f) => ({ ...f, city_id: v, area_zone_id: null }))} disabled={!form.emirate_id} />
          </div>
          <div className="col-span-6">
            <Label>Area / Zone</Label>
            <AreaZoneSelect cityId={form.city_id} value={form.area_zone_id} onValueChange={(v) => setForm((f) => ({ ...f, area_zone_id: v }))} disabled={!form.city_id} />
          </div>
          <div className="col-span-6">
            <Label>Street</Label>
            <Input value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))} />
          </div>
          <div className="col-span-3">
            <Label>Building</Label>
            <Input value={form.building} onChange={(e) => setForm((f) => ({ ...f, building: e.target.value }))} />
          </div>
          <div className="col-span-3">
            <Label>PO Box</Label>
            <Input value={form.po_box} onChange={(e) => setForm((f) => ({ ...f, po_box: e.target.value }))} />
          </div>
          <div className="col-span-12 grid grid-cols-4 gap-3">
            {[
              { key: "is_primary", label: "Primary" },
              { key: "is_billing_address", label: "Billing" },
              { key: "is_shipping_address", label: "Shipping" },
              { key: "is_site_address", label: "Site" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox id={`addr-${key}`} checked={!!form[key as keyof typeof form]} onCheckedChange={(c) => setForm((f) => ({ ...f, [key]: !!c }))} />
                <Label htmlFor={`addr-${key}`}>{label}</Label>
              </div>
            ))}
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
