"use client";

import { useState, useMemo } from "react";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { UserWithRoles, Role, OwnerCompany, Branch } from "@/types/database";
import { assignRoleToUser } from "@/server/actions/users";
import { RequiredLabel } from "@/components/erp/required-label";

type AssignRoleDialogProps = {
  user: UserWithRoles;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles?: Role[];
  companies?: OwnerCompany[];
  branches?: Branch[];
};

function filterAssignableRoles(roles: Role[]): Role[] {
  return roles.filter((r) => r.is_active && r.is_assignable !== false);
}

export function AssignRoleDialog({
  user,
  open,
  onOpenChange,
  roles = [],
  companies = [],
  branches = [],
}: AssignRoleDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedScope, setSelectedScope] = useState<"global" | "company" | "branch">("global");
  const [roleId, setRoleId] = useState<string>("");
  const [ownerCompanyId, setOwnerCompanyId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");

  const assignableRoles = useMemo(() => filterAssignableRoles(roles), [roles]);

  const roleOptions = useMemo(
    () =>
      assignableRoles.map((r) => ({
        value: String(r.id),
        label: r.role_name,
        code: r.role_code,
      })),
    [assignableRoles],
  );

  const handleFormSubmit = async () => {
    if (!roleId) {
      toast.error("Please select a role");
      return;
    }
    setIsSubmitting(true);
    const data = {
      user_profile_id: user.id,
      role_id: parseInt(roleId, 10),
      owner_company_id: selectedScope === "global" ? null : parseInt(ownerCompanyId, 10) || null,
      branch_id: selectedScope === "branch" ? parseInt(branchId, 10) || null : null,
      is_active: true,
    };
    try {
      const result = await assignRoleToUser(data);
      if (result.success) {
        toast.success("Role assigned successfully");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "Failed to assign role");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={`Assign Role to ${user.full_name || user.display_name || "User"}`}
      subtitle="Select a role and scope for this user assignment"
      icon={<ShieldCheck className="h-5 w-5" />}
      mode="add"
      size="sm"
      isSubmitting={isSubmitting}
      onSubmit={handleFormSubmit}
      submitLabel="Assign Role"
    >
      <div className="space-y-4">
        <div>
          <RequiredLabel required>Role</RequiredLabel>
          <ERPCombobox
            value={roleId}
            onValueChange={(v) => setRoleId(v != null ? String(v) : "")}
            options={roleOptions}
            placeholder="Select role..."
            searchPlaceholder="Search roles..."
            showCode
            required
          />
        </div>

        <div>
          <RequiredLabel htmlFor="scope">Scope</RequiredLabel>
          <select
            id="scope"
            value={selectedScope}
            onChange={(e) => setSelectedScope(e.target.value as "global" | "company" | "branch")}
            className={selectClass}
          >
            <option value="global">Global</option>
            <option value="company">Company</option>
            <option value="branch">Branch</option>
          </select>
        </div>

        {selectedScope !== "global" && (
          <div>
            <RequiredLabel htmlFor="owner_company_id" required>
              Organization
            </RequiredLabel>
            <select
              id="owner_company_id"
              value={ownerCompanyId}
              onChange={(e) => setOwnerCompanyId(e.target.value)}
              required
              className={selectClass}
            >
              <option value="">Select organization...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legal_name_en}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedScope === "branch" && (
          <div>
            <RequiredLabel htmlFor="branch_id" required>
              Branch
            </RequiredLabel>
            <select
              id="branch_id"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              required
              className={selectClass}
            >
              <option value="">Select branch...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.branch_name_en}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </ERPChildDialogForm>
  );
}
