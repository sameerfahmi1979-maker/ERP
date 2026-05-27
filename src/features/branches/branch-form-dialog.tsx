"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { BranchWithCompany, OwnerCompany } from "@/types/database";
import { createBranch, updateBranch } from "@/server/actions/branches";

type BranchFormDialogProps = {
  branch?: BranchWithCompany | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies?: OwnerCompany[];
};

export function BranchFormDialog({
  branch,
  open,
  onOpenChange,
  companies = [],
}: BranchFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = Boolean(branch);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      owner_company_id: parseInt(formData.get("owner_company_id") as string),
      branch_code: formData.get("branch_code") as string,
      branch_name_en: formData.get("branch_name_en") as string,
      branch_name_ar: (formData.get("branch_name_ar") as string) || null,
      emirate: (formData.get("emirate") as string) || null,
      area: (formData.get("area") as string) || null,
      address_line_1: (formData.get("address_line_1") as string) || null,
      address_line_2: (formData.get("address_line_2") as string) || null,
      po_box: (formData.get("po_box") as string) || null,
      phone: (formData.get("phone") as string) || null,
      email: (formData.get("email") as string) || null,
      status: (formData.get("status") as "active" | "inactive" | "suspended") || "active",
    };

    try {
      const result = isEditing && branch
        ? await updateBranch({ ...data, id: branch.id })
        : await createBranch(data);

      if (result.success) {
        toast.success(isEditing ? "Branch updated" : "Branch created");
        onOpenChange(false);
      } else {
        toast.error(result.error || "Failed to save branch");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Branch" : "Create Branch"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="owner_company_id">Organization *</Label>
              <select
                id="owner_company_id"
                name="owner_company_id"
                defaultValue={branch?.owner_company_id}
                disabled={isEditing}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select organization...</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.legal_name_en} ({company.company_code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="branch_code">Branch Code *</Label>
              <Input
                id="branch_code"
                name="branch_code"
                defaultValue={branch?.branch_code}
                disabled={isEditing}
                required
                className="uppercase"
              />
            </div>
            <div>
              <Label htmlFor="branch_name_en">Branch Name (English) *</Label>
              <Input
                id="branch_name_en"
                name="branch_name_en"
                defaultValue={branch?.branch_name_en}
                required
              />
            </div>
            <div>
              <Label htmlFor="branch_name_ar">Branch Name (Arabic)</Label>
              <Input
                id="branch_name_ar"
                name="branch_name_ar"
                defaultValue={branch?.branch_name_ar ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="emirate">Emirate</Label>
              <Input id="emirate" name="emirate" defaultValue={branch?.emirate ?? ""} />
            </div>
            <div>
              <Label htmlFor="area">Area</Label>
              <Input id="area" name="area" defaultValue={branch?.area ?? ""} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="address_line_1">Address Line 1</Label>
              <Input id="address_line_1" name="address_line_1" defaultValue={branch?.address_line_1 ?? ""} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="address_line_2">Address Line 2</Label>
              <Input id="address_line_2" name="address_line_2" defaultValue={branch?.address_line_2 ?? ""} />
            </div>
            <div>
              <Label htmlFor="po_box">P.O. Box</Label>
              <Input id="po_box" name="po_box" defaultValue={branch?.po_box ?? ""} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={branch?.phone ?? ""} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input type="email" id="email" name="email" defaultValue={branch?.email ?? ""} />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue={branch?.status || "active"}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
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
