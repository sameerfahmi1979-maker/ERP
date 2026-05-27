"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { UserWithRoles, OwnerCompany, Branch } from "@/types/database";
import { adminUpdateUserProfile } from "@/server/actions/users";

type UserEditDialogProps = {
  user: UserWithRoles;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies?: OwnerCompany[];
  branches?: Branch[];
};

export function UserEditDialog({
  user,
  open,
  onOpenChange,
  companies = [],
  branches = [],
}: UserEditDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      id: user.id,
      full_name: (formData.get("full_name") as string) || null,
      display_name: (formData.get("display_name") as string) || null,
      phone: (formData.get("phone") as string) || null,
      job_title: (formData.get("job_title") as string) || null,
      department: (formData.get("department") as string) || null,
      owner_company_id: formData.get("owner_company_id") ? parseInt(formData.get("owner_company_id") as string) : null,
      branch_id: formData.get("branch_id") ? parseInt(formData.get("branch_id") as string) : null,
      status: formData.get("status") as "active" | "inactive" | "suspended",
    };

    try {
      const result = await adminUpdateUserProfile(data);

      if (result.success) {
        toast.success("User profile updated");
        onOpenChange(false);
      } else {
        toast.error(result.error || "Failed to update user profile");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit User Profile</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="full_name">Full Name</Label>
              <Input id="full_name" name="full_name" defaultValue={user.full_name ?? ""} />
            </div>
            <div>
              <Label htmlFor="display_name">Display Name</Label>
              <Input id="display_name" name="display_name" defaultValue={user.display_name ?? ""} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={user.phone ?? ""} />
            </div>
            <div>
              <Label htmlFor="job_title">Job Title</Label>
              <Input id="job_title" name="job_title" defaultValue={user.job_title ?? ""} />
            </div>
            <div>
              <Label htmlFor="department">Department</Label>
              <Input id="department" name="department" defaultValue={user.department ?? ""} />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <select id="status" name="status" defaultValue={user.status} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div>
              <Label htmlFor="owner_company_id">Organization</Label>
              <select id="owner_company_id" name="owner_company_id" defaultValue={user.owner_company_id ?? ""} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">None</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.legal_name_en}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="branch_id">Branch</Label>
              <select id="branch_id" name="branch_id" defaultValue={user.branch_id ?? ""} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">None</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.branch_name_en}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
