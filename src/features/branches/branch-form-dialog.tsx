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
      // Basic Branch Details
      owner_company_id: parseInt(formData.get("owner_company_id") as string),
      branch_code: formData.get("branch_code") as string,
      branch_name_en: formData.get("branch_name_en") as string,
      branch_name_ar: (formData.get("branch_name_ar") as string) || null,
      status: (formData.get("status") as "active" | "inactive" | "suspended") || "active",
      
      // Phase 002D: Branch categorization
      branch_type: (formData.get("branch_type") as string) || null,
      is_main_branch: formData.get("is_main_branch") === "on",
      operating_status: (formData.get("operating_status") as "active" | "maintenance" | "suspended" | "closed") || "active",
      
      // Location
      emirate: (formData.get("emirate") as string) || null,
      city: (formData.get("city") as string) || null,
      area: (formData.get("area") as string) || null,
      address_line_1: (formData.get("address_line_1") as string) || null,
      address_line_2: (formData.get("address_line_2") as string) || null,
      po_box: (formData.get("po_box") as string) || null,
      makani_number: (formData.get("makani_number") as string) || null,
      latitude: formData.get("latitude") ? Number(formData.get("latitude")) : null,
      longitude: formData.get("longitude") ? Number(formData.get("longitude")) : null,
      
      // Contact
      phone: (formData.get("phone") as string) || null,
      email: (formData.get("email") as string) || null,
      contact_person_name: (formData.get("contact_person_name") as string) || null,
      contact_phone: (formData.get("contact_phone") as string) || null,
      contact_email: (formData.get("contact_email") as string) || null,
      
      // Operational Flags
      has_workshop: formData.get("has_workshop") === "on",
      has_warehouse: formData.get("has_warehouse") === "on",
      has_yard: formData.get("has_yard") === "on",
      has_weighbridge: formData.get("has_weighbridge") === "on",
      
      // Notes
      notes: (formData.get("notes") as string) || null,
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Branch" : "Create Branch"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="location">Location</TabsTrigger>
              <TabsTrigger value="contact">Contact</TabsTrigger>
              <TabsTrigger value="operations">Operations</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            {/* Tab 1: Basic Branch Details */}
            <TabsContent value="basic" className="space-y-4 py-4">
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
                    placeholder="BR-001"
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
                  <Label htmlFor="branch_type">Branch Type</Label>
                  <select
                    id="branch_type"
                    name="branch_type"
                    defaultValue={branch?.branch_type ?? ""}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select Type</option>
                    <option value="Head Office">Head Office</option>
                    <option value="Branch Office">Branch Office</option>
                    <option value="Yard">Yard</option>
                    <option value="Workshop">Workshop</option>
                    <option value="Warehouse">Warehouse</option>
                    <option value="Camp">Camp</option>
                    <option value="Project Site">Project Site</option>
                    <option value="Weighbridge">Weighbridge</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2 pt-8">
                  <Checkbox
                    id="is_main_branch"
                    name="is_main_branch"
                    defaultChecked={branch?.is_main_branch ?? false}
                  />
                  <Label htmlFor="is_main_branch" className="cursor-pointer">
                    Main Branch (Head Office)
                  </Label>
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
                <div>
                  <Label htmlFor="operating_status">Operating Status</Label>
                  <select
                    id="operating_status"
                    name="operating_status"
                    defaultValue={branch?.operating_status || "active"}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="suspended">Suspended</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>
            </TabsContent>

            {/* Tab 2: Location */}
            <TabsContent value="location" className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="emirate">Emirate</Label>
                  <select
                    id="emirate"
                    name="emirate"
                    defaultValue={branch?.emirate ?? ""}
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
                  <Input id="city" name="city" defaultValue={branch?.city ?? ""} />
                </div>
                <div>
                  <Label htmlFor="area">Area / District</Label>
                  <Input id="area" name="area" defaultValue={branch?.area ?? ""} />
                </div>
                <div>
                  <Label htmlFor="po_box">PO Box</Label>
                  <Input id="po_box" name="po_box" defaultValue={branch?.po_box ?? ""} />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="address_line_1">Address Line 1</Label>
                  <Input
                    id="address_line_1"
                    name="address_line_1"
                    defaultValue={branch?.address_line_1 ?? ""}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="address_line_2">Address Line 2</Label>
                  <Input
                    id="address_line_2"
                    name="address_line_2"
                    defaultValue={branch?.address_line_2 ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="makani_number">Makani Number</Label>
                  <Input
                    id="makani_number"
                    name="makani_number"
                    defaultValue={branch?.makani_number ?? ""}
                    placeholder="UAE Makani address"
                  />
                </div>
                <div>
                  <Label htmlFor="latitude">Latitude</Label>
                  <Input
                    type="number"
                    id="latitude"
                    name="latitude"
                    step="0.0000001"
                    min="-90"
                    max="90"
                    defaultValue={branch?.latitude ?? ""}
                    placeholder="25.276987"
                  />
                </div>
                <div>
                  <Label htmlFor="longitude">Longitude</Label>
                  <Input
                    type="number"
                    id="longitude"
                    name="longitude"
                    step="0.0000001"
                    min="-180"
                    max="180"
                    defaultValue={branch?.longitude ?? ""}
                    placeholder="55.296249"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Tab 3: Contact */}
            <TabsContent value="contact" className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">Branch Phone</Label>
                  <Input id="phone" name="phone" defaultValue={branch?.phone ?? ""} />
                </div>
                <div>
                  <Label htmlFor="email">Branch Email</Label>
                  <Input type="email" id="email" name="email" defaultValue={branch?.email ?? ""} />
                </div>
                <div>
                  <Label htmlFor="contact_person_name">Contact Person Name</Label>
                  <Input
                    id="contact_person_name"
                    name="contact_person_name"
                    defaultValue={branch?.contact_person_name ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="contact_phone">Contact Person Phone</Label>
                  <Input
                    id="contact_phone"
                    name="contact_phone"
                    defaultValue={branch?.contact_phone ?? ""}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="contact_email">Contact Person Email</Label>
                  <Input
                    type="email"
                    id="contact_email"
                    name="contact_email"
                    defaultValue={branch?.contact_email ?? ""}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Tab 4: Operational Flags */}
            <TabsContent value="operations" className="space-y-4 py-4">
              <div className="space-y-4">
                <div className="flex flex-col space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Select the operational capabilities available at this branch:
                  </p>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="has_workshop"
                      name="has_workshop"
                      defaultChecked={branch?.has_workshop ?? false}
                    />
                    <Label htmlFor="has_workshop" className="cursor-pointer">
                      Has Workshop (Vehicle/Equipment Service Center)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="has_warehouse"
                      name="has_warehouse"
                      defaultChecked={branch?.has_warehouse ?? false}
                    />
                    <Label htmlFor="has_warehouse" className="cursor-pointer">
                      Has Warehouse (Inventory Storage)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="has_yard"
                      name="has_yard"
                      defaultChecked={branch?.has_yard ?? false}
                    />
                    <Label htmlFor="has_yard" className="cursor-pointer">
                      Has Yard (Vehicle/Equipment Parking)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="has_weighbridge"
                      name="has_weighbridge"
                      defaultChecked={branch?.has_weighbridge ?? false}
                    />
                    <Label htmlFor="has_weighbridge" className="cursor-pointer">
                      Has Weighbridge (Cargo/Vehicle Weighing)
                    </Label>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Tab 5: Notes */}
            <TabsContent value="notes" className="space-y-4 py-4">
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  defaultValue={branch?.notes ?? ""}
                  rows={8}
                  placeholder="Internal notes about this branch..."
                />
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
