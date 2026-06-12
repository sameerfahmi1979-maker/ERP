"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, MapPin } from "lucide-react";
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
import { CountrySelect, EmirateSelect, CitySelect, AreaZoneSelect } from "@/components/erp/geography";
import type { CustomerAddress } from "@/features/master-data/customers/types";
import {
  getCustomerAddresses,
  deleteCustomerAddress,
  createCustomerAddress,
  updateCustomerAddress,
} from "@/server/actions/master-data/customer-addresses";

type CustomerAddressesSectionProps = {
  customerId: number;
  disabled?: boolean;
};

export function CustomerAddressesSection({ customerId, disabled }: CustomerAddressesSectionProps) {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    address_type_code: null as string | null,
    country_id: null as number | null,
    emirate_id: null as number | null,
    city_id: null as number | null,
    area_zone_id: null as number | null,
    address_line_1: "",
    address_line_2: "",
    building_name: "",
    street_name: "",
    po_box: "",
    makani_number: "",
    latitude: "",
    longitude: "",
    is_primary: false,
    is_billing_address: false,
    is_shipping_address: false,
    notes: "",
    status_code: "ACTIVE",
  });

  const loadAddresses = async () => {
    setLoading(true);
    const result = await getCustomerAddresses(customerId);
    if (result.success && result.data) {
      setAddresses(result.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAddresses();
  }, [customerId]);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this address?")) return;
    const result = await deleteCustomerAddress(id);
    if (result.success) {
      toast.success("Address deleted");
      loadAddresses();
    } else {
      toast.error(result.error ?? "Failed to delete address");
    }
  };

  const openAddDialog = () => {
    setEditingAddress(null);
    setFormData({
      address_type_code: null,
      country_id: null,
      emirate_id: null,
      city_id: null,
      area_zone_id: null,
      address_line_1: "",
      address_line_2: "",
      building_name: "",
      street_name: "",
      po_box: "",
      makani_number: "",
      latitude: "",
      longitude: "",
      is_primary: false,
      is_billing_address: false,
      is_shipping_address: false,
      notes: "",
      status_code: "ACTIVE",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (address: CustomerAddress) => {
    setEditingAddress(address);
    setFormData({
      address_type_code: address.address_type_code,
      country_id: address.country_id,
      emirate_id: address.emirate_id,
      city_id: address.city_id,
      area_zone_id: address.area_zone_id,
      address_line_1: address.address_line_1 || "",
      address_line_2: address.address_line_2 || "",
      building_name: address.building_name || "",
      street_name: address.street_name || "",
      po_box: address.po_box || "",
      makani_number: address.makani_number || "",
      latitude: address.latitude?.toString() || "",
      longitude: address.longitude?.toString() || "",
      is_primary: address.is_primary,
      is_billing_address: address.is_billing_address,
      is_shipping_address: address.is_shipping_address,
      notes: address.notes || "",
      status_code: address.status_code,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        customer_id: customerId,
        address_type_code: formData.address_type_code,
        country_id: formData.country_id,
        emirate_id: formData.emirate_id,
        city_id: formData.city_id,
        area_zone_id: formData.area_zone_id,
        address_line_1: formData.address_line_1 || null,
        address_line_2: formData.address_line_2 || null,
        building_name: formData.building_name || null,
        street_name: formData.street_name || null,
        po_box: formData.po_box || null,
        makani_number: formData.makani_number || null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        is_primary: formData.is_primary,
        is_billing_address: formData.is_billing_address,
        is_shipping_address: formData.is_shipping_address,
        notes: formData.notes || null,
        status_code: formData.status_code,
        sort_order: 0,
      };

      const result = editingAddress
        ? await updateCustomerAddress({ id: editingAddress.id, ...payload })
        : await createCustomerAddress(payload);

      if (result.success) {
        toast.success(editingAddress ? "Address updated" : "Address created");
        setIsDialogOpen(false);
        loadAddresses();
      } else {
        toast.error(result.error ?? "Failed to save address");
      }
    } catch (error) {
      toast.error("An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading addresses...</div>;

  return (
    <div>
      {!disabled && (
        <Button size="sm" className="mb-4" onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Address
        </Button>
      )}

      {addresses.length === 0 ? (
        <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-md">
          No additional addresses added yet
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((address) => (
            <div key={address.id} className="p-4 border rounded-md">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4" />
                    {address.is_primary && <Badge variant="default" className="text-xs">Primary</Badge>}
                    {address.is_billing_address && <Badge variant="secondary" className="text-xs">Billing</Badge>}
                    {address.is_shipping_address && <Badge variant="outline" className="text-xs">Shipping</Badge>}
                  </div>
                  <div className="text-sm space-y-1">
                    {address.address_line_1 && <div>{address.address_line_1}</div>}
                    {address.address_line_2 && <div>{address.address_line_2}</div>}
                    {address.po_box && <div className="text-muted-foreground">PO Box: {address.po_box}</div>}
                  </div>
                </div>
                {!disabled && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(address)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(address.id)}>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAddress ? "Edit Address" : "Add Address"}</DialogTitle>
            <DialogDescription>
              {editingAddress ? "Update address information" : "Add a new address for this customer"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="address_type_code">Address Type</Label>
                <LookupSelect
                  categoryCode="ADDRESS_TYPES"
                  value={formData.address_type_code}
                  onValueChange={(v) => setFormData({ ...formData, address_type_code: v as string | null })}
                  valueField="code"
                />
              </div>

              <div>
                <Label htmlFor="status_code" className="required">Status</Label>
                <LookupSelect
                  categoryCode="PARTY_STATUS_TYPES"
                  value={formData.status_code}
                  onValueChange={(v) => setFormData({ ...formData, status_code: v as string })}
                  valueField="code"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="country_id">Country</Label>
                <CountrySelect
                  value={formData.country_id}
                  onValueChange={(v: number | null) => setFormData({ ...formData, country_id: v, emirate_id: null, city_id: null, area_zone_id: null })}
                />
              </div>

              <div>
                <Label htmlFor="emirate_id">Emirate</Label>
                <EmirateSelect
                  countryId={formData.country_id}
                  value={formData.emirate_id}
                  onValueChange={(v: number | null) => setFormData({ ...formData, emirate_id: v, city_id: null, area_zone_id: null })}
                />
              </div>

              <div>
                <Label htmlFor="city_id">City</Label>
                <CitySelect
                  emirateId={formData.emirate_id}
                  value={formData.city_id}
                  onValueChange={(v: number | null) => setFormData({ ...formData, city_id: v, area_zone_id: null })}
                />
              </div>

              <div>
                <Label htmlFor="area_zone_id">Area/Zone</Label>
                <AreaZoneSelect
                  cityId={formData.city_id}
                  value={formData.area_zone_id}
                  onValueChange={(v: number | null) => setFormData({ ...formData, area_zone_id: v })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="building_name">Building Name</Label>
                <Input
                  id="building_name"
                  value={formData.building_name}
                  onChange={(e) => setFormData({ ...formData, building_name: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="street_name">Street Name</Label>
                <Input
                  id="street_name"
                  value={formData.street_name}
                  onChange={(e) => setFormData({ ...formData, street_name: e.target.value })}
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="address_line_1">Address Line 1</Label>
                <Input
                  id="address_line_1"
                  value={formData.address_line_1}
                  onChange={(e) => setFormData({ ...formData, address_line_1: e.target.value })}
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="address_line_2">Address Line 2</Label>
                <Input
                  id="address_line_2"
                  value={formData.address_line_2}
                  onChange={(e) => setFormData({ ...formData, address_line_2: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="po_box">PO Box</Label>
                <Input
                  id="po_box"
                  value={formData.po_box}
                  onChange={(e) => setFormData({ ...formData, po_box: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="makani_number">Makani Number</Label>
                <Input
                  id="makani_number"
                  value={formData.makani_number}
                  onChange={(e) => setFormData({ ...formData, makani_number: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="latitude">Latitude</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                  placeholder="-90 to 90"
                />
              </div>

              <div>
                <Label htmlFor="longitude">Longitude</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                  placeholder="-180 to 180"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Address Flags</Label>
              <div className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_primary"
                    checked={formData.is_primary}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_primary: !!checked })}
                  />
                  <Label htmlFor="is_primary" className="font-normal">Primary Address</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_billing_address"
                    checked={formData.is_billing_address}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_billing_address: !!checked })}
                  />
                  <Label htmlFor="is_billing_address" className="font-normal">Billing Address</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_shipping_address"
                    checked={formData.is_shipping_address}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_shipping_address: !!checked })}
                  />
                  <Label htmlFor="is_shipping_address" className="font-normal">Shipping Address</Label>
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
                {isSubmitting ? "Saving..." : editingAddress ? "Update Address" : "Add Address"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
