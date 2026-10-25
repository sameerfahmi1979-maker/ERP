"use client";

import { useState, useMemo } from "react";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { UserWithRoles, Role } from "@/types/domain";
import type { UserCompanyOption, UserBranchOption } from "@/lib/users/scope-options";
import { assignRoleToUser } from "@/server/actions/users";
import { administratorScope, administratorRoleLabel, administratorAccessSummary, assignmentScopeError } from "@/lib/rbac/administrator-policy";
import { RequiredLabel } from "@/components/erp/required-label";

// High-privilege role codes that warrant a warning
const HIGH_PRIVILEGE_ROLE_CODES = new Set([
  "system_admin",
  "group_admin",
  "company_admin",
  "branch_admin",
]);

type AssignRoleDialogProps = {
  user: UserWithRoles;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles?: Role[];
  canAssignGlobal?: boolean;
  companies?: UserCompanyOption[];
  branches?: UserBranchOption[];
};

function filterAssignableRoles(roles: Role[]): Role[] {
  return roles.filter((r) => r.is_active && r.is_assignable !== false);
}

export function AssignRoleDialog(props: AssignRoleDialogProps) {
  return props.open ? <AssignRoleDialogFields key={props.user.id} {...props} /> : null;
}

function AssignRoleDialogFields({
  user,
  open,
  onOpenChange,
  roles = [],
  canAssignGlobal = false,
  companies = [],
  branches = [],
}: AssignRoleDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addAnotherScope, setAddAnotherScope] = useState(false);
  const [selectedScope, setSelectedScope] = useState<"global" | "company" | "branch">(user.branch_id ? "branch" : "company");
  const [roleId, setRoleId] = useState<string>("");
  const [ownerCompanyId, setOwnerCompanyId] = useState<string>(user.owner_company_id ? String(user.owner_company_id) : "");
  const [branchId, setBranchId] = useState<string>(user.branch_id ? String(user.branch_id) : "");

  const assignableRoles = useMemo(() => filterAssignableRoles(roles).filter(r => canAssignGlobal || !["system_admin","group_admin","company_admin"].includes(r.role_code)), [roles, canAssignGlobal]);

  const roleOptions = useMemo(
    () =>
      assignableRoles.map((r) => ({
        value: String(r.id),
        label: administratorRoleLabel(r.role_code, r.role_name),
        code: r.role_code,
      })),
    [assignableRoles],
  );

  // Filter branches by selected company
  const filteredBranches = useMemo(() => {
    if (!ownerCompanyId) return [];
    return branches.filter((b) => String(b.owner_company_id) === ownerCompanyId);
  }, [branches, ownerCompanyId]);

  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: String(c.id), label: `${c.legal_name_en}${c.company_code ? ` (${c.company_code})` : ""}` })),
    [companies],
  );

  const branchOptions = useMemo(
    () => filteredBranches.map((b) => ({ value: String(b.id), label: `${b.branch_name_en}${b.branch_code ? ` (${b.branch_code})` : ""}` })),
    [filteredBranches],
  );

  // Detect high-privilege role selection
  const selectedRole = assignableRoles.find((r) => String(r.id) === roleId);
  const isHighPrivilege = selectedRole && HIGH_PRIVILEGE_ROLE_CODES.has(selectedRole.role_code);

  const handleFormSubmit = async () => {
    if (isSubmitting) return;
    if (!selectedRole) {
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
    if (selectedScope !== 'global' && !companies.some(c => String(c.id) === ownerCompanyId)) { toast.error('Choose an available company.'); return; }
    if (selectedScope === 'branch' && !filteredBranches.some(b => String(b.id) === branchId)) { toast.error('Choose a branch belonging to the selected company.'); return; }
    const shapeError = assignmentScopeError(selectedRole?.role_code ?? '', selectedScope === 'global' ? null : Number(ownerCompanyId), selectedScope === 'branch' ? Number(branchId) : null);
    if (shapeError) { toast.error(shapeError); return; }
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
        if (addAnotherScope && selectedScope !== 'global') { setOwnerCompanyId(''); setBranchId(''); }
        else onOpenChange(false);
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
      subtitle="Add one assignment per company or branch. A user can have several assignments."
      icon={<ShieldCheck className="h-5 w-5" />}
      mode="add"
      size="sm"
      isSubmitting={isSubmitting}
      onSubmit={handleFormSubmit}
      submitLabel="Assign Role"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Each assignment adds access only to its selected company or branch. Existing assignments remain unchanged.</p>
        {selectedScope !== 'global' && <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={addAnotherScope} onChange={event => setAddAnotherScope(event.target.checked)} />
          Keep open to add another company or branch
        </label>}
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
          <ERPCombobox ariaLabel="Role"
            value={roleId}
            onValueChange={(v) => {
              setRoleId(v != null ? String(v) : "");
              const requiredScope = administratorScope(assignableRoles.find(r => String(r.id) === String(v))?.role_code ?? '');
              if (requiredScope) { setSelectedScope(requiredScope); if (requiredScope !== 'branch') setBranchId(''); }
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
          <ERPCombobox ariaLabel="Scope"
            value={selectedScope}
            onValueChange={(v) => {
              // Clearing a required selector must never widen the assignment.
              if (v !== "global" && v !== "company" && v !== "branch") return;
              setSelectedScope(v);
            }}
            options={[
              { value: "global", label: "Global System — all companies and branches" },
              { value: "company", label: "Company" },
              { value: "branch", label: "Branch" },
            ].filter(option => (option.value !== 'global' || canAssignGlobal) && (!administratorScope(selectedRole?.role_code ?? '') || option.value === administratorScope(selectedRole?.role_code ?? '')))}
            placeholder="Select scope..."
            required
          />
        </div>

        {selectedRole && administratorAccessSummary(selectedRole.role_code) && (
          <p className="text-sm text-muted-foreground" role="note">{administratorAccessSummary(selectedRole.role_code)}</p>
        )}
        {selectedScope !== "global" && (
          <div>
            <RequiredLabel required>Organization</RequiredLabel>
            <ERPCombobox ariaLabel="Organization"
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
            <ERPCombobox ariaLabel="Branch"
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
