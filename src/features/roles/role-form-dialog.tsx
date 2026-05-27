"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@/types/database";
import { createRole, updateRole } from "@/server/actions/roles";

type RoleFormDialogProps = {
  role?: Role | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RoleFormDialog({ role, open, onOpenChange }: RoleFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = Boolean(role);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      role_code: (formData.get("role_code") as string).toLowerCase().replace(/\s+/g, "_"),
      role_name: formData.get("role_name") as string,
      description: (formData.get("description") as string) || null,
      is_system_role: formData.get("is_system_role") === "true",
      is_active: formData.get("is_active") === "true",
    };

    try {
      const result = isEditing && role
        ? await updateRole({ ...data, id: role.id })
        : await createRole(data);

      if (result.success) {
        toast.success(isEditing ? "Role updated" : "Role created");
        onOpenChange(false);
      } else {
        toast.error(result.error || "Failed to save role");
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
          <DialogTitle>{isEditing ? "Edit Role" : "Create Role"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="role_code">Role Code *</Label>
            <Input
              id="role_code"
              name="role_code"
              defaultValue={role?.role_code}
              disabled={isEditing}
              required
              className="lowercase"
              placeholder="e.g., fleet_manager"
            />
          </div>
          <div>
            <Label htmlFor="role_name">Role Name *</Label>
            <Input id="role_name" name="role_name" defaultValue={role?.role_name} required />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" defaultValue={role?.description ?? ""} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="is_system_role">Type</Label>
              <select
                id="is_system_role"
                name="is_system_role"
                defaultValue={role?.is_system_role ? "true" : "false"}
                disabled={role?.is_system_role}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="false">Custom</option>
                <option value="true">System</option>
              </select>
            </div>
            <div>
              <Label htmlFor="is_active">Status</Label>
              <select
                id="is_active"
                name="is_active"
                defaultValue={role?.is_active !== false ? "true" : "false"}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
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
