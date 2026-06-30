"use client";

import { useState, useMemo, useEffect } from "react";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { UserWithRoles, Role, OwnerCompany, Branch } from "@/types/database";
import { assignRoleToUser } from "@/server/actions/users";
import { RequiredLabel } from "@/components/erp/required-label";

// High-privilege role codes that warrant a warning
const HIGH_PRIVILEGE_ROLE_CODES = new Set([
  "system_admin",
  "group_admin",
  "company_admin",
]);

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

  // Reset form whenever dialog opens
  useEffect(() => {
    if (open) {
      setSelectedScope("global");
      setRoleId("");
      setOwnerCompanyId("");
      setBranchId("");
    }
  }, [open]);

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

  // Filter branches by selected company
  const filteredBranches = useMemo(() => {
    if (!ownerCompanyId) return branches;
    return branches.filter((b) => String(b.owner_company_id) === ownerCompanyId);
  }, [branches, ownerCompanyId]);

  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: String(c.id), label: c.legal_name_en })),
    [companies],
  );

  const branchOptions = useMemo(
    () => filteredBranches.map((b) => ({ value: String(b.id), label: b.branch_name_en })),
    [filteredBranches],
  );

  // Detect high-privilege role selection
  const selectedRole = assignableRoles.find((r) => String(r.id) === roleId);
  const isHighPrivilege = selectedRole && HIGH_PRIVILEGE_ROLE_CODES.has(selectedRole.role_code);

  const handleFormSubmit = async () => {
    if (!roleId) {
      toast.error("Please select a role");
      return;
    }
    if (selectedScope !== "global" && !ownerCompanyId) {
      toast.error("Please select an organization for the role scope");
      return;
    }
    if (selectedScope === "branch" && !branchId) {
      toast.error("Please select a branch for the role scope");
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
        {/* High-privilege role warning */}
        {isHighPrivilege && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <span>
              <strong>{selectedRole?.role_name}</strong> is a high-privilege role. Only assign to
              trusted administrators. This action is audited.
            </span>
          </div>
        )}

        <div>
          <RequiredLabel required>Role</RequiredLabel>
          <ERPCombobox
            value={roleId}
            onValueChange={(v) => {
              setRoleId(v != null ? String(v) : "");
            }}
            options={roleOptions}
            placeholder="Select role..."
            searchPlaceholder="Search roles..."
            showCode
            required
          />
        </div>

        <div>
          <RequiredLabel htmlFor="scope">Scope</RequiredLabel>
          <ERPCombobox
            value={selectedScope}
            onValueChange={(v) => {
              setSelectedScope((v as "global" | "company" | "branch") ?? "global");
              setOwnerCompanyId("");
              setBranchId("");
            }}
            options={[
              { value: "global", label: "Global" },
              { value: "company", label: "Company" },
              { value: "branch", label: "Branch" },
            ]}
            placeholder="Select scope..."
          />
        </div>

        {selectedScope !== "global" && (
          <div>
            <RequiredLabel required>Organization</RequiredLabel>
            <ERPCombobox
              value={ownerCompanyId}
              onValueChange={(v) => {
                setOwnerCompanyId(v != null ? String(v) : "");
                setBranchId(""); // reset branch when company changes
              }}
              options={companyOptions}
              placeholder="Select organization..."
              searchPlaceholder="Search organizations..."
              required
            />
          </div>
        )}

        {selectedScope === "branch" && (
          <div>
            <RequiredLabel required>Branch</RequiredLabel>
            <ERPCombobox
              value={branchId}
              onValueChange={(v) => setBranchId(v != null ? String(v) : "")}
              options={branchOptions}
              placeholder={ownerCompanyId ? "Select branch..." : "Select an organization first"}
              searchPlaceholder="Search branches..."
              required
            />
            {ownerCompanyId && filteredBranches.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No branches found for the selected organization.
              </p>
            )}
          </div>
        )}
      </div>
    </ERPChildDialogForm>
  );
}
