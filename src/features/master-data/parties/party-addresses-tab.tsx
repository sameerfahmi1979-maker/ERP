"use client";

import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";

import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, MapPin } from "lucide-react";
import { toast } from "sonner";
import {PartyAddressDialog} from './party-address-dialog';
import {PartyChildLifecycleControl,usePartyChildLifecycle} from './party-child-lifecycle-control';
import type {SavePartyAddress} from './use-party-address-save';
import { ERPCombobox } from "@/components/erp/combobox";
import { RequiredLabel } from "@/components/erp/required-label";
import { CountrySelect, EmirateSelect, CitySelect, AreaZoneSelect } from "@/components/erp/geography";
import { usePartyAddressesQuery } from "./hooks/use-party-child-queries";
import { invalidatePartyAddresses } from "@/lib/query/invalidation";
import { useRealtimeSync } from "@/hooks/realtime/use-realtime-sync";
import { getPartyAddressTypes } from "@/server/actions/master-data/parties";
import { savedSelection, withSavedSelection } from "@/lib/master-data/saved-selection";
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
  const { items: addresses, isLoading, error: loadError, refetch } = usePartyAddressesQuery(partyId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const lifecycle=usePartyChildLifecycle({entity:'party_addresses',onSaved:()=>{invalidatePartyAddresses(queryClient,partyId);},onOpenChange:onChildOpen});
  const lifecycleOpen=lifecycle.isOpen;
  const setDialogOpen = (open: boolean) => { setIsDialogOpen(open); onChildOpen?.(open); };
  const [editing, setEditing] = useState<PartyAddress | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  // ERP REALTIME.1B — scoped live sync for this party's addresses.
  // Subscription is suppressed while a child dialog is open to protect unsaved form data.
  useRealtimeSync({
    table: "party_addresses",
    event: "*",
    filter: `party_id=eq.${partyId}`,
    enabled: !isDialogOpen && !lifecycleOpen,
    debounceMs: 400,
    onEvent: () => {
      invalidatePartyAddresses(queryClient, partyId);
    },
  });

  const { data: addressTypes, error: addressTypesError } = useQuery({
    queryKey: ["party_address_types"],
    queryFn: async () => { const result = await getPartyAddressTypes(); if (!result.success || !result.data) throw new Error("Address types could not be loaded."); return result.data; },
    staleTime: 5 * 60 * 1000,
  });

  const openAdd = () => {
    if(lifecycleOpen)return;
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (item: PartyAddress) => {
    if(lifecycleOpen)return;
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


  const handleSubmit = async (save:SavePartyAddress) => {
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
        latitude: editing?.latitude ?? null,
        longitude: editing?.longitude ?? null,
        is_primary: form.is_primary,
        is_billing_address: form.is_billing_address,
        is_shipping_address: form.is_shipping_address,
        is_site_address: form.is_site_address,
        is_active: form.is_active,
        notes: form.notes || null,
      };

      const result = await save(payload);

      if (result.success) {
        toast.success(result.data?.changed===false ? "No changes to save" : `Address ${editing ? "updated" : "added"}`);
        setDialogOpen(false);
        invalidatePartyAddresses(queryClient, partyId);
      } else {
        toast.error(result.error ?? "Failed to save address");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: ColumnDef<PartyAddress>[] = [
    {id:'archive_state',header:'Archive status',accessorFn:row=>row.archived_at?'Archived':'Current'},
    {id:"address_code",header:"Address",size:360,accessorFn:row=>[row.address_code,row.address_name,row.city_name,row.emirate_name,row.country_name].filter(Boolean).join(" "),enableHiding:false,cell:({row})=>{const addr=row.original;return (<div className="space-y-1">
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
              </div>);}},
    {accessorKey:"is_billing_address",header:"Billing",},
    {id:"actions",header:"Actions",size:180,enableSorting:false,enableHiding:false,cell:({row})=>{const addr=row.original;return (<>{!disabled && (
                <div className="flex gap-1 shrink-0">
                  <Button aria-label="Edit record" type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={Boolean(addr.archived_at)} onClick={() => openEdit(addr)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <PartyChildLifecycleControl record={addr} onOpen={()=>lifecycle.open(addr,addr.address_code)}/>
                </div>
              )}</>);}},
  ];

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

      {loadError ? <div role="alert" className="rounded border p-4"><p>Address records could not be loaded.</p><Button type="button" variant="outline" onClick={refetch}>Try again</Button></div> :
        <ERPDataTable tableId={`party.addresses:${partyId}`} resultsLabel="Address" data={addresses ?? []} columns={columns} enableRowSelection={false} />}

      {isDialogOpen && <PartyAddressDialog
        key={`${partyId}:${editing?.id??'new'}`}
        formId={`party-addresses-tab:${partyId}`}
        address={editing}
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
            <ERPCombobox ariaLabel="Address Type"
              value={form.address_type_id}
              onValueChange={(v) => setForm((f) => ({ ...f, address_type_id: v !== null ? Number(v) : null }))}
              options={withSavedSelection((addressTypesError ? [] : addressTypes ?? []).map(t => ({ value: t.id, label: t.name_en })), form.address_type_id, savedSelection(editing?.address_type_id, editing?.address_type_name))}
              error={addressTypesError ? "Address types could not be loaded. Your saved selection is retained." : undefined}
              placeholder="Select type..."
              required
            />
          </div>
          <div className="col-span-6">
            <Label>Address Name / Label</Label>
            <Input aria-label="Address Name / Label" value={form.address_name} onChange={(e) => setForm((f) => ({ ...f, address_name: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <RequiredLabel required>Country</RequiredLabel>
            <CountrySelect savedSelection={savedSelection(editing?.country_id, editing?.country_name)} value={form.country_id} onValueChange={(v) => setForm((f) => ({ ...f, country_id: v, emirate_id: null, city_id: null, area_zone_id: null }))} />
          </div>
          <div className="col-span-6">
            <Label>Emirate</Label>
            <EmirateSelect savedSelection={form.country_id === editing?.country_id ? savedSelection(editing?.emirate_id, editing?.emirate_name) : undefined} countryId={form.country_id} value={form.emirate_id} onValueChange={(v) => setForm((f) => ({ ...f, emirate_id: v, city_id: null, area_zone_id: null }))} disabled={!form.country_id} />
          </div>
          <div className="col-span-6">
            <Label>City</Label>
            <CitySelect savedSelection={form.country_id === editing?.country_id && form.emirate_id === editing?.emirate_id ? savedSelection(editing?.city_id, editing?.city_name) : undefined} emirateId={form.emirate_id} value={form.city_id} onValueChange={(v) => setForm((f) => ({ ...f, city_id: v, area_zone_id: null }))} disabled={!form.emirate_id} />
          </div>
          <div className="col-span-6">
            <Label>Area / Zone</Label>
            <AreaZoneSelect savedSelection={form.country_id === editing?.country_id && form.emirate_id === editing?.emirate_id && form.city_id === editing?.city_id ? savedSelection(editing?.area_zone_id, editing?.area_zone_name) : undefined} cityId={form.city_id} value={form.area_zone_id} onValueChange={(v) => setForm((f) => ({ ...f, area_zone_id: v }))} disabled={!form.city_id} />
          </div>
          <div className="col-span-6">
            <Label>Street</Label>
            <Input aria-label="Street" value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))} />
          </div>
          <div className="col-span-3">
            <Label>Building</Label>
            <Input aria-label="Building" value={form.building} onChange={(e) => setForm((f) => ({ ...f, building: e.target.value }))} />
          </div>
          <div className="col-span-3">
            <Label>PO Box</Label>
            <Input aria-label="PO Box" value={form.po_box} onChange={(e) => setForm((f) => ({ ...f, po_box: e.target.value }))} />
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
            <Textarea aria-label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
      </PartyAddressDialog>}
      {lifecycle.dialog}
    </div>
  );
}
