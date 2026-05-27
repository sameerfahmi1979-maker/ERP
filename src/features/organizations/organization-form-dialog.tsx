"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { OwnerCompany } from "@/types/database";
import { createOrganization, updateOrganization } from "@/server/actions/organizations";

type OrganizationFormDialogProps = {
  organization?: OwnerCompany | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function OrganizationFormDialog({
  organization,
  open,
  onOpenChange,
}: OrganizationFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = Boolean(organization);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    
    // Build data object with all Phase 002D fields
    const data = {
      // Basic Information
      legal_name_en: formData.get("legal_name_en") as string,
      legal_name_ar: (formData.get("legal_name_ar") as string) || null,
      short_name: (formData.get("short_name") as string) || null,
      company_code: formData.get("company_code") as string,
      legal_form: (formData.get("legal_form") as string) || null,
      country: (formData.get("country") as string) || "United Arab Emirates",
      status: (formData.get("status") as "active" | "inactive" | "suspended") || "active",
      default_currency: (formData.get("default_currency") as string) || "AED",
      
      // Address & Contact
      emirate: (formData.get("emirate") as string) || null,
      city: (formData.get("city") as string) || null,
      area: (formData.get("area") as string) || null,
      address_line_1: (formData.get("address_line_1") as string) || null,
      address_line_2: (formData.get("address_line_2") as string) || null,
      po_box: (formData.get("po_box") as string) || null,
      makani_number: (formData.get("makani_number") as string) || null,
      primary_email: (formData.get("primary_email") as string) || null,
      primary_phone: (formData.get("primary_phone") as string) || null,
      website: (formData.get("website") as string) || null,
      
      // Legal & Licensing
      trade_license_no: (formData.get("trade_license_no") as string) || null,
      trade_license_issue_date: (formData.get("trade_license_issue_date") as string) || null,
      trade_license_expiry_date: (formData.get("trade_license_expiry_date") as string) || null,
      licensing_authority: (formData.get("licensing_authority") as string) || null,
      chamber_membership_no: (formData.get("chamber_membership_no") as string) || null,
      chamber_membership_expiry_date: (formData.get("chamber_membership_expiry_date") as string) || null,
      
      // Tax & Compliance
      trn: (formData.get("trn") as string) || null,
      vat_registered: formData.get("vat_registered") === "on",
      corporate_tax_no: (formData.get("corporate_tax_no") as string) || null,
      corporate_tax_registered: formData.get("corporate_tax_registered") === "on",
      icv_certificate_no: (formData.get("icv_certificate_no") as string) || null,
      icv_score: formData.get("icv_score") ? Number(formData.get("icv_score")) : null,
      icv_issue_date: (formData.get("icv_issue_date") as string) || null,
      icv_expiry_date: (formData.get("icv_expiry_date") as string) || null,
      adnoc_supplier_no: (formData.get("adnoc_supplier_no") as string) || null,
      
      // Other
      logo_url: (formData.get("logo_url") as string) || null,
      notes: (formData.get("notes") as string) || null,
    };

    try {
      const result = isEditing && organization
        ? await updateOrganization({ ...data, id: organization.id })
        : await createOrganization(data);

      if (result.success) {
        toast.success(isEditing ? "Organization updated" : "Organization created");
        onOpenChange(false);
      } else {
        toast.error(result.error || "Failed to save organization");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Organization" : "Create Organization"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="address">Address</TabsTrigger>
              <TabsTrigger value="legal">Legal</TabsTrigger>
              <TabsTrigger value="tax">Tax</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            {/* Tab 1: Basic Information */}
            <TabsContent value="basic" className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="legal_name_en">Legal Name (English) *</Label>
                  <Input
                    id="legal_name_en"
                    name="legal_name_en"
                    defaultValue={organization?.legal_name_en}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="legal_name_ar">Legal Name (Arabic)</Label>
                  <Input
                    id="legal_name_ar"
                    name="legal_name_ar"
                    defaultValue={organization?.legal_name_ar ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="company_code">Company Code *</Label>
                  <Input
                    id="company_code"
                    name="company_code"
                    defaultValue={organization?.company_code}
                    disabled={isEditing}
                    required
                    className="uppercase"
                    placeholder="ABC-001"
                  />
                </div>
                <div>
                  <Label htmlFor="short_name">Short Name</Label>
                  <Input
                    id="short_name"
                    name="short_name"
                    defaultValue={organization?.short_name ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="legal_form">Legal Form</Label>
                  <Input
                    id="legal_form"
                    name="legal_form"
                    defaultValue={organization?.legal_form ?? ""}
                    placeholder="LLC, FZC, Branch"
                  />
                </div>
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    name="country"
                    defaultValue={organization?.country || "United Arab Emirates"}
                  />
                </div>
                <div>
                  <Label htmlFor="default_currency">Currency</Label>
                  <Input
                    id="default_currency"
                    name="default_currency"
                    defaultValue={organization?.default_currency || "AED"}
                  />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={organization?.status || "active"}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>
            </TabsContent>

            {/* Tab 2: Address & Contact */}
            <TabsContent value="address" className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="emirate">Emirate</Label>
                  <select
                    id="emirate"
                    name="emirate"
                    defaultValue={organization?.emirate ?? ""}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select Emirate</option>
                    <option value="Abu Dhabi">Abu Dhabi</option>
                    <option value="Dubai">Dubai</option>
                    <option value="Sharjah">Sharjah</option>
                    <option value="Ajman">Ajman</option>
                    <option value="Umm Al Quwain">Umm Al Quwain</option>
                    <option value="Ras Al Khaimah">Ras Al Khaimah</option>
                    <option value="Fujairah">Fujairah</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input id="city" name="city" defaultValue={organization?.city ?? ""} />
                </div>
                <div>
                  <Label htmlFor="area">Area / District</Label>
                  <Input id="area" name="area" defaultValue={organization?.area ?? ""} />
                </div>
                <div>
                  <Label htmlFor="po_box">PO Box</Label>
                  <Input id="po_box" name="po_box" defaultValue={organization?.po_box ?? ""} />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="address_line_1">Address Line 1</Label>
                  <Input
                    id="address_line_1"
                    name="address_line_1"
                    defaultValue={organization?.address_line_1 ?? ""}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="address_line_2">Address Line 2</Label>
                  <Input
                    id="address_line_2"
                    name="address_line_2"
                    defaultValue={organization?.address_line_2 ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="makani_number">Makani Number</Label>
                  <Input
                    id="makani_number"
                    name="makani_number"
                    defaultValue={organization?.makani_number ?? ""}
                    placeholder="UAE Makani address"
                  />
                </div>
                <div>
                  <Label htmlFor="primary_email">Primary Email</Label>
                  <Input
                    type="email"
                    id="primary_email"
                    name="primary_email"
                    defaultValue={organization?.primary_email ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="primary_phone">Primary Phone</Label>
                  <Input
                    id="primary_phone"
                    name="primary_phone"
                    defaultValue={organization?.primary_phone ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    type="url"
                    id="website"
                    name="website"
                    defaultValue={organization?.website ?? ""}
                    placeholder="https://example.com"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Tab 3: Legal & Licensing */}
            <TabsContent value="legal" className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="trade_license_no">Trade License Number</Label>
                  <Input
                    id="trade_license_no"
                    name="trade_license_no"
                    defaultValue={organization?.trade_license_no ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="licensing_authority">Licensing Authority</Label>
                  <Input
                    id="licensing_authority"
                    name="licensing_authority"
                    defaultValue={organization?.licensing_authority ?? ""}
                    placeholder="DED, FTZ, etc."
                  />
                </div>
                <div>
                  <Label htmlFor="trade_license_issue_date">License Issue Date</Label>
                  <Input
                    type="date"
                    id="trade_license_issue_date"
                    name="trade_license_issue_date"
                    defaultValue={organization?.trade_license_issue_date ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="trade_license_expiry_date">License Expiry Date</Label>
                  <Input
                    type="date"
                    id="trade_license_expiry_date"
                    name="trade_license_expiry_date"
                    defaultValue={organization?.trade_license_expiry_date ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="chamber_membership_no">Chamber Membership Number</Label>
                  <Input
                    id="chamber_membership_no"
                    name="chamber_membership_no"
                    defaultValue={organization?.chamber_membership_no ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="chamber_membership_expiry_date">Chamber Expiry Date</Label>
                  <Input
                    type="date"
                    id="chamber_membership_expiry_date"
                    name="chamber_membership_expiry_date"
                    defaultValue={organization?.chamber_membership_expiry_date ?? ""}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Tab 4: Tax & Compliance */}
            <TabsContent value="tax" className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="trn">Tax Registration Number (TRN)</Label>
                  <Input id="trn" name="trn" defaultValue={organization?.trn ?? ""} />
                </div>
                <div className="flex items-center space-x-2 pt-8">
                  <Checkbox
                    id="vat_registered"
                    name="vat_registered"
                    defaultChecked={organization?.vat_registered ?? true}
                  />
                  <Label htmlFor="vat_registered" className="cursor-pointer">
                    VAT Registered
                  </Label>
                </div>
                <div>
                  <Label htmlFor="corporate_tax_no">Corporate Tax Number</Label>
                  <Input
                    id="corporate_tax_no"
                    name="corporate_tax_no"
                    defaultValue={organization?.corporate_tax_no ?? ""}
                  />
                </div>
                <div className="flex items-center space-x-2 pt-8">
                  <Checkbox
                    id="corporate_tax_registered"
                    name="corporate_tax_registered"
                    defaultChecked={organization?.corporate_tax_registered ?? false}
                  />
                  <Label htmlFor="corporate_tax_registered" className="cursor-pointer">
                    Corporate Tax Registered
                  </Label>
                </div>
                <div>
                  <Label htmlFor="icv_certificate_no">ICV Certificate Number</Label>
                  <Input
                    id="icv_certificate_no"
                    name="icv_certificate_no"
                    defaultValue={organization?.icv_certificate_no ?? ""}
                    placeholder="In-Country Value certificate"
                  />
                </div>
                <div>
                  <Label htmlFor="icv_score">ICV Score (0-100)</Label>
                  <Input
                    type="number"
                    id="icv_score"
                    name="icv_score"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue={organization?.icv_score ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="icv_issue_date">ICV Issue Date</Label>
                  <Input
                    type="date"
                    id="icv_issue_date"
                    name="icv_issue_date"
                    defaultValue={organization?.icv_issue_date ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="icv_expiry_date">ICV Expiry Date</Label>
                  <Input
                    type="date"
                    id="icv_expiry_date"
                    name="icv_expiry_date"
                    defaultValue={organization?.icv_expiry_date ?? ""}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="adnoc_supplier_no">ADNOC Supplier Number</Label>
                  <Input
                    id="adnoc_supplier_no"
                    name="adnoc_supplier_no"
                    defaultValue={organization?.adnoc_supplier_no ?? ""}
                    placeholder="ADNOC supplier registration number"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Tab 5: Notes & Other */}
            <TabsContent value="notes" className="space-y-4 py-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="logo_url">Logo URL</Label>
                  <Input
                    type="url"
                    id="logo_url"
                    name="logo_url"
                    defaultValue={organization?.logo_url ?? ""}
                    placeholder="https://example.com/logo.png"
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    defaultValue={organization?.notes ?? ""}
                    rows={6}
                    placeholder="Internal notes about this organization..."
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 mt-6 pt-6 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
