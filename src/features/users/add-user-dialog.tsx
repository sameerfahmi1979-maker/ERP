"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { OwnerCompany, Branch, Role } from "@/types/database";
import { createUser } from "@/server/actions/users";

type AddUserDialogProps = {
  companies: OwnerCompany[];
  branches: Branch[];
  roles: Role[];
};

export function AddUserDialog({ companies, branches, roles }: AddUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendInvite, setSendInvite] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  // Filter branches by selected company
  const filteredBranches = selectedCompanyId
    ? branches.filter((b) => b.owner_company_id === selectedCompanyId)
    : branches;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    
    const data = {
      email: formData.get("email") as string,
      temporary_password: sendInvite ? undefined : (formData.get("temporary_password") as string),
      send_invite_email: sendInvite,
      full_name: formData.get("full_name") as string,
      display_name: (formData.get("display_name") as string) || null,
      phone: (formData.get("phone") as string) || null,
      job_title: (formData.get("job_title") as string) || null,
      department: (formData.get("department") as string) || null,
      owner_company_id: formData.get("owner_company_id")
        ? Number(formData.get("owner_company_id"))
        : null,
      branch_id: formData.get("branch_id") ? Number(formData.get("branch_id")) : null,
      status: (formData.get("status") as "active" | "inactive" | "suspended") || "active",
      initial_role_id: formData.get("initial_role_id")
        ? Number(formData.get("initial_role_id"))
        : null,
      initial_role_scope_company_id: formData.get("initial_role_scope_company_id")
        ? Number(formData.get("initial_role_scope_company_id"))
        : null,
      initial_role_scope_branch_id: formData.get("initial_role_scope_branch_id")
        ? Number(formData.get("initial_role_scope_branch_id"))
        : null,
    };

    try {
      const result = await createUser(data);

      if (result.success) {
        toast.success("User created successfully");
        setOpen(false);
        e.currentTarget.reset();
        setSendInvite(true);
        setSelectedCompanyId(null);
      } else {
        toast.error(result.error || "Failed to create user");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button size="sm" className="h-9 text-xs gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Add User
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Authentication Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Authentication</h3>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="send_invite"
                    checked={sendInvite}
                    onCheckedChange={(checked) => setSendInvite(checked === true)}
                  />
                  <Label htmlFor="send_invite" className="cursor-pointer text-sm">
                    Send invite email
                  </Label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    type="email"
                    id="email"
                    name="email"
                    required
                    placeholder="user@example.com"
                  />
                </div>
                {!sendInvite && (
                  <div className="col-span-2">
                    <Label htmlFor="temporary_password">Temporary Password *</Label>
                    <Input
                      type="password"
                      id="temporary_password"
                      name="temporary_password"
                      required={!sendInvite}
                      placeholder="Minimum 8 characters"
                      minLength={8}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      User will be required to change password on first login
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Profile Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input id="full_name" name="full_name" required />
                </div>
                <div>
                  <Label htmlFor="display_name">Display Name</Label>
                  <Input id="display_name" name="display_name" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" placeholder="+971 XX XXX XXXX" />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    name="status"
                    defaultValue="active"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="job_title">Job Title</Label>
                  <Input id="job_title" name="job_title" />
                </div>
                <div>
                  <Label htmlFor="department">Department</Label>
                  <Input id="department" name="department" />
                </div>
              </div>
            </div>

            {/* Organization Assignment */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Organization Assignment</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="owner_company_id">Company</Label>
                  <select
                    id="owner_company_id"
                    name="owner_company_id"
                    value={selectedCompanyId ?? ""}
                    onChange={(e) => setSelectedCompanyId(e.target.value ? Number(e.target.value) : null)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select company...</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.legal_name_en} ({company.company_code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="branch_id">Branch</Label>
                  <select
                    id="branch_id"
                    name="branch_id"
                    disabled={!selectedCompanyId}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                  >
                    <option value="">Select branch...</option>
                    {filteredBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.branch_name_en} ({branch.branch_code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Initial Role Assignment */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Initial Role Assignment (Optional)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="initial_role_id">Role</Label>
                  <select
                    id="initial_role_id"
                    name="initial_role_id"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">No initial role</option>
                    {roles
                      .filter((r) => r.is_active)
                      .map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.role_name} ({role.role_code})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="initial_role_scope_company_id">Role Scope: Company</Label>
                  <select
                    id="initial_role_scope_company_id"
                    name="initial_role_scope_company_id"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Global scope</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.legal_name_en}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="initial_role_scope_branch_id">Role Scope: Branch</Label>
                  <select
                    id="initial_role_scope_branch_id"
                    name="initial_role_scope_branch_id"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">All branches</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.branch_name_en} ({branch.branch_code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave role scope empty for global access. Select company for company-wide access. Select branch for branch-specific access.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create User
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
