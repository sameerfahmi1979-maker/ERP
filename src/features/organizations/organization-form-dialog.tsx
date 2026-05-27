"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    const data = {
      legal_name_en: formData.get("legal_name_en") as string,
      legal_name_ar: (formData.get("legal_name_ar") as string) || null,
      short_name: (formData.get("short_name") as string) || null,
      company_code: formData.get("company_code") as string,
      legal_form: (formData.get("legal_form") as string) || null,
      country: (formData.get("country") as string) || null,
      emirate: (formData.get("emirate") as string) || null,
      trade_license_no: (formData.get("trade_license_no") as string) || null,
      trn: (formData.get("trn") as string) || null,
      corporate_tax_no: (formData.get("corporate_tax_no") as string) || null,
      default_currency: (formData.get("default_currency") as string) || "AED",
      status: (formData.get("status") as "active" | "inactive" | "suspended") || "active",
      primary_email: (formData.get("primary_email") as string) || null,
      primary_phone: (formData.get("primary_phone") as string) || null,
      website: (formData.get("website") as string) || null,
      logo_url: (formData.get("logo_url") as string) || null,
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Organization" : "Create Organization"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
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
              <Label htmlFor="company_code">Company Code *</Label>
              <Input
                id="company_code"
                name="company_code"
                defaultValue={organization?.company_code}
                disabled={isEditing}
                required
                className="uppercase"
              />
            </div>
            <div>
              <Label htmlFor="short_name">Short Name</Label>
              <Input id="short_name" name="short_name" defaultValue={organization?.short_name ?? ""} />
            </div>
            <div>
              <Label htmlFor="emirate">Emirate</Label>
              <Input id="emirate" name="emirate" defaultValue={organization?.emirate ?? ""} />
            </div>
            <div>
              <Label htmlFor="default_currency">Currency</Label>
              <Input id="default_currency" name="default_currency" defaultValue={organization?.default_currency || "AED"} />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <select id="status" name="status" defaultValue={organization?.status || "active"} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div>
              <Label htmlFor="primary_email">Email</Label>
              <Input type="email" id="primary_email" name="primary_email" defaultValue={organization?.primary_email ?? ""} />
            </div>
            <div>
              <Label htmlFor="primary_phone">Phone</Label>
              <Input id="primary_phone" name="primary_phone" defaultValue={organization?.primary_phone ?? ""} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
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
