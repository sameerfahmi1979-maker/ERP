"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { UserWithRoles, Role, OwnerCompany, Branch } from "@/types/database";
import { assignRoleToUser } from "@/server/actions/users";

type AssignRoleDialogProps = {
  user: UserWithRoles;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles?: Role[];
  companies?: OwnerCompany[];
  branches?: Branch[];
};

export function AssignRoleDialog({
  user,
  open,
  onOpenChange,
  roles = [],
  companies = [],
  branches = [],
}: AssignRoleDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedScope, setSelectedScope] = useState<"global" | "company" | "branch">("global");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      user_profile_id: user.id,
      role_id: parseInt(formData.get("role_id") as string),
      owner_company_id: selectedScope === "global" ? null : (parseInt(formData.get("owner_company_id") as string) || null),
      branch_id: selectedScope === "branch" ? (parseInt(formData.get("branch_id") as string) || null) : null,
      is_active: true,
    };

    try {
      const result = await assignRoleToUser(data);

      if (result.success) {
        toast.success("Role assigned successfully");
        onOpenChange(false);
      } else {
        toast.error(result.error || "Failed to assign role");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Role to {user.full_name || user.display_name || "User"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="role_id">Role *</Label>
            <select id="role_id" name="role_id" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Select role...</option>
              {roles.filter(r => r.is_active).map((r) => (
                <option key={r.id} value={r.id}>{r.role_name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="scope">Scope</Label>
            <select
              id="scope"
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value as "global" | "company" | "branch")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="global">Global</option>
              <option value="company">Company</option>
              <option value="branch">Branch</option>
            </select>
          </div>

          {selectedScope !== "global" && (
            <div>
              <Label htmlFor="owner_company_id">Organization *</Label>
              <select id="owner_company_id" name="owner_company_id" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select organization...</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.legal_name_en}</option>
                ))}
              </select>
            </div>
          )}

          {selectedScope === "branch" && (
            <div>
              <Label htmlFor="branch_id">Branch *</Label>
              <select id="branch_id" name="branch_id" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select branch...</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.branch_name_en}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign Role
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
