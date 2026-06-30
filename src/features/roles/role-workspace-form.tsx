"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Role } from "@/types/database";
import { createRole, updateRole } from "@/server/actions/roles";
import { RequiredLabel } from "@/components/erp/required-label";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { Shield, ShieldAlert, Users, Lock, Clock } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  ERPRecordWorkspaceForm,
  ERPRecordSectionPanel,
} from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { ROLE_CATEGORIES, ROLE_LEVELS } from "@/features/roles/role-constants";
import { RoleAssignedUsersSection } from "@/features/roles/role-assigned-users-section";
import { RolePermissionsSection } from "@/features/roles/role-permissions-section";

type RoleWorkspaceFormProps = {
  role?: Role | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "role-workspace-form";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40";

export function RoleWorkspaceForm({ role, mode, authContext }: RoleWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");

  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const isAdding = mode === "add";

  const canManage = authContext.permissionCodes?.includes("roles.manage") ||
    authContext.roleCodes?.includes("system_admin");
  // Inline isGlobalAdmin check to avoid server-only import in client component
  const isAdmin = authContext.roleCodes.includes("system_admin") ||
    authContext.roleCodes.includes("group_admin");

  // For system roles: editable only by global admin
  const canEditThisRole = isAdding || (!role?.is_system_role ? canManage : isAdmin);

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, syncDraft, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  // Sections: add mode has only overview; view/edit modes have all four
  const sections = [
    { id: "overview", label: "Overview", icon: Shield },
    ...(!isAdding ? [
      { id: "permissions", label: "Permissions", icon: Lock },
      { id: "assigned-users", label: "Assigned Users", icon: Users },
      { id: "audit", label: "Audit Info", icon: Clock },
    ] : []),
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);
    setIsSubmitting(true);
    try {
      const isAssignable = formData.get("is_assignable") === "true";
      const isActive = formData.get("is_active") === "true";

      if (isEditing && role) {
        const result = await updateRole({
          id: role.id,
          role_name: formData.get("role_name") as string,
          display_name: (formData.get("display_name") as string) || null,
          description: (formData.get("description") as string) || null,
          role_category: (formData.get("role_category") as string) || null,
          role_level: (formData.get("role_level") as string) || null,
          is_assignable: isAssignable,
          notes: (formData.get("notes") as string) || null,
          is_active: isActive,
        });
        if (result.success) {
          toast.success("Role updated");
          clearDraft();
          resetDirty();
          return true;
        }
        toast.error(result.error ?? "Failed to update role");
        return false;
      }

      // Create
      const result = await createRole({
        role_code: (formData.get("role_code") as string).toLowerCase().replace(/\s+/g, "_"),
        role_name: formData.get("role_name") as string,
        display_name: (formData.get("display_name") as string) || null,
        description: (formData.get("description") as string) || null,
        role_category: (formData.get("role_category") as string) || null,
        role_level: (formData.get("role_level") as string) || null,
        is_assignable: isAssignable,
        notes: (formData.get("notes") as string) || null,
        is_active: isActive,
      });

      if (result.success) {
        toast.success("Role created");
        clearDraft();
        resetDirty();
        return true;
      }
      toast.error(result.error ?? "Failed to create role");
      return false;
    } catch {
      toast.error("An unexpected error occurred");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndClose = async () => {
    const success = await handleSave();
    if (success) forceCloseActiveTab();
  };

  const isEditable = !isViewing && canEditThisRole;

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Role" : isEditing ? "Edit Role" : "New Role"}
      subtitle={role ? `Role Code: ${role.role_code}` : "Define a new custom security role"}
      recordCode={role?.role_code}
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={isDirty}
      onSave={isEditable ? handleSave : undefined}
      onSaveAndClose={isEditable ? handleSaveAndClose : undefined}
      onRequestClose={handleRequestClose}
      isSubmitting={isSubmitting}
    >
      {/* ── OVERVIEW ────────────────────────────────────────── */}
      <ERPRecordSectionPanel id="overview" activeId={activeSection} title="Role Details">
        {/* System role warning */}
        {role?.is_system_role && (
          <div className="col-span-12 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <span>
              This is a <strong>system role</strong> managed by the ERP engine.
              {isAdmin
                ? " You have global admin access to edit it."
                : " Only global administrators can modify it."}
            </span>
          </div>
        )}

        <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); handleSaveAndClose(); }} onInput={syncDraft} onChange={syncDraft}>
          <div className="grid grid-cols-12 gap-4">
            {/* Role Code */}
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="role_code">Role Code</RequiredLabel>
              <Input
                id="role_code"
                name="role_code"
                className="lowercase font-mono text-sm"
                defaultValue={getDraftDefault("role_code", role?.role_code ?? "")}
                disabled={isViewing || isEditing}
                required
                placeholder="e.g., fleet_manager"
              />
              {isEditing && (
                <p className="text-xs text-muted-foreground">Role code cannot be changed after creation.</p>
              )}
            </div>

            {/* Is System Role — read-only badge */}
            <div className="col-span-6 space-y-1.5">
              <label className="text-sm font-medium">Role Type</label>
              <div className="flex h-9 items-center">
                <Badge variant={role?.is_system_role ? "default" : "secondary"}>
                  {role?.is_system_role ? "System Role" : "Custom Role"}
                </Badge>
                {isAdding && <span className="ml-2 text-xs text-muted-foreground">(always custom on create)</span>}
              </div>
            </div>

            {/* Role Name */}
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="role_name">Role Name</RequiredLabel>
              <Input
                id="role_name"
                name="role_name"
                defaultValue={getDraftDefault("role_name", role?.role_name ?? "")}
                disabled={!isEditable}
                required
              />
            </div>

            {/* Display Name */}
            <div className="col-span-6 space-y-1.5">
              <label htmlFor="display_name" className="text-sm font-medium">Display Name</label>
              <Input
                id="display_name"
                name="display_name"
                defaultValue={getDraftDefault("display_name", role?.display_name ?? "")}
                disabled={!isEditable}
                placeholder="Friendly label shown in UI"
              />
            </div>

            {/* Category */}
            <div className="col-span-4 space-y-1.5">
              <label htmlFor="role_category" className="text-sm font-medium">Category</label>
              <select
                id="role_category"
                name="role_category"
                defaultValue={getDraftDefault("role_category", role?.role_category ?? "")}
                disabled={!isEditable}
                className={selectClass}
              >
                <option value="">— Select category —</option>
                {ROLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Level */}
            <div className="col-span-4 space-y-1.5">
              <label htmlFor="role_level" className="text-sm font-medium">Level</label>
              <select
                id="role_level"
                name="role_level"
                defaultValue={getDraftDefault("role_level", role?.role_level ?? "")}
                disabled={!isEditable}
                className={selectClass}
              >
                <option value="">— Select level —</option>
                {ROLE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            {/* Is Assignable */}
            <div className="col-span-4 space-y-1.5">
              <label htmlFor="is_assignable" className="text-sm font-medium">Assignable</label>
              <select
                id="is_assignable"
                name="is_assignable"
                defaultValue={getDraftDefault(
                  "is_assignable",
                  role?.is_assignable !== false ? "true" : "false",
                )}
                disabled={!isEditable || role?.role_code === "system_admin"}
                className={selectClass}
              >
                <option value="true">Yes — can be assigned to users</option>
                <option value="false">No — hidden from assign dialog</option>
              </select>
            </div>

            {/* Status */}
            <div className="col-span-6 space-y-1.5">
              <label htmlFor="is_active" className="text-sm font-medium">Status</label>
              <select
                id="is_active"
                name="is_active"
                defaultValue={getDraftDefault(
                  "is_active",
                  role?.is_active !== false ? "true" : "false",
                )}
                disabled={!isEditable || role?.role_code === "system_admin"}
                className={selectClass}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
              {role?.role_code === "system_admin" && (
                <p className="text-xs text-muted-foreground">The system_admin role cannot be deactivated.</p>
              )}
            </div>

            {/* Description */}
            <div className="col-span-12 space-y-1.5">
              <label htmlFor="description" className="text-sm font-medium">Description</label>
              <Textarea
                id="description"
                name="description"
                defaultValue={getDraftDefault("description", role?.description ?? "")}
                disabled={!isEditable}
                rows={3}
                placeholder="What this role provides access to..."
              />
            </div>

            {/* Notes */}
            <div className="col-span-12 space-y-1.5">
              <label htmlFor="notes" className="text-sm font-medium">Notes</label>
              <Textarea
                id="notes"
                name="notes"
                defaultValue={getDraftDefault("notes", role?.notes ?? "")}
                disabled={!isEditable}
                rows={2}
                placeholder="Internal notes (not shown to users)"
              />
            </div>
          </div>
        </form>
      </ERPRecordSectionPanel>

      {/* ── PERMISSIONS ─────────────────────────────────────── */}
      {!isAdding && role && (
        <ERPRecordSectionPanel id="permissions" activeId={activeSection} title="Permissions" lazyMount>
          <RolePermissionsSection
            roleId={role.id}
            isSystemRole={role.is_system_role}
            canManage={canManage ?? false}
            isGlobalAdmin={isAdmin}
          />
        </ERPRecordSectionPanel>
      )}

      {/* ── ASSIGNED USERS ──────────────────────────────────── */}
      {!isAdding && role && (
        <ERPRecordSectionPanel id="assigned-users" activeId={activeSection} title="Assigned Users" lazyMount>
          <RoleAssignedUsersSection
            roleId={role.id}
            roleName={role.role_name}
            canManageUsers={
              authContext.permissionCodes?.includes("users.update") ||
              authContext.roleCodes?.includes("system_admin") ||
              false
            }
          />
        </ERPRecordSectionPanel>
      )}

      {/* ── AUDIT INFO ──────────────────────────────────────── */}
      {!isAdding && role && (
        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Info">
          <div className="col-span-12 grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Created</p>
              <p className="text-sm">
                {role.created_at
                  ? new Date(role.created_at).toLocaleString("en-GB", {
                      day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })
                  : "—"}
              </p>
            </div>
            <div className="col-span-6 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Last Updated</p>
              <p className="text-sm">
                {role.updated_at
                  ? new Date(role.updated_at).toLocaleString("en-GB", {
                      day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })
                  : "—"}
              </p>
            </div>
            <div className="col-span-6 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Role ID</p>
              <p className="text-sm font-mono">{role.id}</p>
            </div>
            <div className="col-span-6 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Role Code</p>
              <p className="text-sm font-mono">{role.role_code}</p>
            </div>
          </div>
        </ERPRecordSectionPanel>
      )}
    </ERPRecordWorkspaceForm>
  );
}

