"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { UserWithRoles, OwnerCompany, Branch, Role } from "@/types/database";
import { createUser, adminUpdateUserProfile } from "@/server/actions/users";
import { RequiredLabel } from "@/components/erp/required-label";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { Key, User, Building2, Shield, ShieldAlert, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import {
  ERPRecordWorkspaceForm,
  ERPRecordSectionPanel,
} from "@/components/workspace/erp-record-workspace-form";
import { AssignRoleDialog } from "./assign-role-dialog";
import { format } from "date-fns";

type UserWorkspaceFormProps = {
  user?: UserWithRoles | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
  companies?: OwnerCompany[];
  branches?: Branch[];
  roles?: Role[];
};

const FORM_ID = "user-workspace-form";

export function UserWorkspaceForm({
  user,
  mode,
  companies = [],
  branches = [],
  roles = [],
}: UserWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState(mode === "add" ? "auth" : "profile");
  const [sendInvite, setSendInvite] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(user?.owner_company_id ?? null);
  const [assignRoleOpen, setAssignRoleOpen] = useState(false);

  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  // â”€â”€ Draft preservation (UI.4E.2) â€” NOTE: password fields excluded by denylist â”€â”€
  const { getDraftDefault, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({
    formId: FORM_ID,
    enabled: !isViewing,
  });

  const filteredBranches = selectedCompanyId
    ? branches.filter((b) => b.owner_company_id === selectedCompanyId)
    : branches;

  const sections = mode === "add"
    ? [
        { id: "auth", label: "Authentication", icon: Key },
        { id: "profile", label: "Profile Details", icon: User },
        { id: "assignment", label: "Organization", icon: Building2 },
        { id: "role", label: "Initial Role", icon: Shield },
      ]
    : [
        { id: "profile", label: "Profile Details", icon: User },
        { id: "assignment", label: "Organization", icon: Building2 },
        { id: "roles", label: "Roles", icon: Shield },
        { id: "audit", label: "Audit Info", icon: Info },
      ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    const form = document.getElementById(FORM_ID) as HTMLFormElement | null;
    if (!form) return false;
    setIsSubmitting(true);
    const formData = new FormData(form);

    try {
      if (isEditing && user) {
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
          notes: (formData.get("notes") as string) || null,
          employee_reference: (formData.get("employee_reference") as string) || null,
        };
        const result = await adminUpdateUserProfile(data);
        if (result.success) {
          toast.success("User profile updated");
          clearDraft();
          resetDirty();
          if (activeTab?.id) markDirty(activeTab.id, false);
          return true;
        } else { toast.error(result.error || "Failed to update user profile"); return false; }
      } else {
        const data = {
          email: formData.get("email") as string,
          temporary_password: sendInvite ? undefined : (formData.get("temporary_password") as string),
          send_invite_email: sendInvite,
          full_name: formData.get("full_name") as string,
          display_name: (formData.get("display_name") as string) || null,
          phone: (formData.get("phone") as string) || null,
          job_title: (formData.get("job_title") as string) || null,
          department: (formData.get("department") as string) || null,
          owner_company_id: formData.get("owner_company_id") ? Number(formData.get("owner_company_id")) : null,
          branch_id: formData.get("branch_id") ? Number(formData.get("branch_id")) : null,
          status: (formData.get("status") as "active" | "inactive" | "suspended") || "active",
          initial_role_id: formData.get("initial_role_id") ? Number(formData.get("initial_role_id")) : null,
          initial_role_scope_company_id: formData.get("initial_role_scope_company_id") ? Number(formData.get("initial_role_scope_company_id")) : null,
          initial_role_scope_branch_id: formData.get("initial_role_scope_branch_id") ? Number(formData.get("initial_role_scope_branch_id")) : null,
        };
        const result = await createUser(data);
        if (result.success) {
          toast.success("User created successfully");
          if (result.error) toast.warning(result.error); // invite email warning
          form.reset();
          setSendInvite(true);
          setSelectedCompanyId(null);
          clearDraft();
          resetDirty();
          if (activeTab?.id) markDirty(activeTab.id, false);
          return true;
        } else { toast.error(result.error || "Failed to create user"); return false; }
      }
    } catch { toast.error("An unexpected error occurred"); return false; }
    finally { setIsSubmitting(false); }
  };

  const handleSaveAndClose = async () => {
    const success = await handleSave();
    if (success) forceCloseActiveTab();
  };

  const selectClass = "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40";

  return (
    <>
      <ERPRecordWorkspaceForm
        mode={mode}
        title={isViewing ? "View User" : isEditing ? "Edit User Profile" : "New User Account"}
        subtitle={
          user
            ? `${user.display_name ?? user.full_name ?? "Unnamed"} · ${user.email ?? user.user_code ?? ""}`
            : "Provision access credentials for a new employee"
        }
        recordCode={user?.user_code ?? undefined}
        sections={sections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        isDirty={isDirty}
        onSave={isViewing ? undefined : handleSave}
        onSaveAndClose={isViewing ? undefined : handleSaveAndClose}
        onRequestClose={handleRequestClose}
        isSubmitting={isSubmitting}
        isChildDialogOpen={assignRoleOpen}
      >
        <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); handleSaveAndClose(); }} onInput={syncDraft} onChange={syncDraft}>

          {/* â”€â”€ ADD ONLY: Authentication â”€â”€ */}
          {mode === "add" && (
            <ERPRecordSectionPanel id="auth" activeId={activeSection} title="Identity & Authentication">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 flex items-center justify-between border border-border p-3 rounded-lg bg-muted/30">
                  <div className="space-y-0.5">
                    <Label htmlFor="send_invite" className="cursor-pointer text-xs font-semibold">Send Invite Email</Label>
                    <p className="text-[10px] text-muted-foreground">Automatically dispatch login instructions to the user&apos;s inbox.</p>
                  </div>
                  <Checkbox id="send_invite" checked={sendInvite} onCheckedChange={(v) => setSendInvite(v === true)} />
                </div>
                <div className="col-span-12 space-y-1.5">
                  <RequiredLabel htmlFor="email">Email Address</RequiredLabel>
                  <Input type="email" id="email" name="email" required placeholder="user@example.com" />
                </div>
                {!sendInvite && (
                  <div className="col-span-12 space-y-1.5">
                    <RequiredLabel htmlFor="temporary_password">Temporary Password</RequiredLabel>
                    <Input type="password" id="temporary_password" name="temporary_password" required={!sendInvite} placeholder="Minimum 8 characters" minLength={8} />
                    <p className="text-[10px] text-muted-foreground">User will be required to change password on first login</p>
                  </div>
                )}
              </div>
            </ERPRecordSectionPanel>
          )}

          {/* â”€â”€ Profile Details â”€â”€ */}
          <ERPRecordSectionPanel id="profile" activeId={activeSection} title="Personal Profile">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-6 space-y-1.5">
                <RequiredLabel htmlFor="full_name">Full Name</RequiredLabel>
                <Input id="full_name" name="full_name" required defaultValue={getDraftDefault("full_name", user?.full_name ?? "")} disabled={isViewing} />
              </div>
              <div className="col-span-6 space-y-1.5">
                <Label htmlFor="display_name" className="text-muted-foreground text-xs">Display Name</Label>
                <Input id="display_name" name="display_name" defaultValue={getDraftDefault("display_name", user?.display_name ?? "")} disabled={isViewing} />
              </div>
              <div className="col-span-6 space-y-1.5">
                <Label htmlFor="phone" className="text-muted-foreground text-xs">Phone Number</Label>
                <Input id="phone" name="phone" defaultValue={getDraftDefault("phone", user?.phone ?? "")} placeholder="+971 XX XXX XXXX" disabled={isViewing} />
              </div>
              <div className="col-span-6 space-y-1.5">
                <RequiredLabel htmlFor="status">Status</RequiredLabel>
                <select id="status" name="status" defaultValue={getDraftDefault("status", user?.status ?? "active")} disabled={isViewing} className={selectClass}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div className="col-span-6 space-y-1.5">
                <Label htmlFor="job_title" className="text-muted-foreground text-xs">Job Title</Label>
                <Input id="job_title" name="job_title" defaultValue={getDraftDefault("job_title", user?.job_title ?? "")} disabled={isViewing} />
              </div>
              <div className="col-span-6 space-y-1.5">
                <Label htmlFor="department" className="text-muted-foreground text-xs">Department</Label>
                <Input id="department" name="department" defaultValue={getDraftDefault("department", user?.department ?? "")} disabled={isViewing} />
              </div>
              {isEditing && (
                <>
                  <div className="col-span-6 space-y-1.5">
                    <Label htmlFor="employee_reference" className="text-muted-foreground text-xs">Employee Reference</Label>
                    <Input id="employee_reference" name="employee_reference" defaultValue={getDraftDefault("employee_reference", user?.employee_reference ?? "")} disabled={isViewing} />
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <Label className="text-muted-foreground text-xs">User Code</Label>
                    <Input value={user?.user_code ?? "Auto-generated"} disabled className="font-mono" />
                  </div>
                </>
              )}
              {(isEditing || isViewing) && (
                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
                  <Input id="notes" name="notes" defaultValue={getDraftDefault("notes", user?.notes ?? "")} disabled={isViewing} />
                </div>
              )}
            </div>
          </ERPRecordSectionPanel>

          {/* â”€â”€ Organization Assignment â”€â”€ */}
          <ERPRecordSectionPanel id="assignment" activeId={activeSection} title="Organization & Branch Linkage">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-6 space-y-1.5">
                <Label htmlFor="owner_company_id" className="text-muted-foreground text-xs">Parent Organization</Label>
                <select
                  id="owner_company_id"
                  name="owner_company_id"
                  value={selectedCompanyId ?? ""}
                  onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; setSelectedCompanyId(v); writeDraftField("owner_company_id", v ?? ""); }}
                  disabled={isViewing}
                  className={selectClass}
                >
                  <option value="">None / Select company...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.legal_name_en} ({c.company_code})</option>
                  ))}
                </select>
              </div>
              <div className="col-span-6 space-y-1.5">
                <Label htmlFor="branch_id" className="text-muted-foreground text-xs">Assigned Branch</Label>
                <select
                  id="branch_id"
                  name="branch_id"
                  defaultValue={getDraftDefault("branch_id", user?.branch_id ?? "")}
                  disabled={isViewing || !selectedCompanyId}
                  className={selectClass}
                >
                  <option value="">None / Select branch...</option>
                  {filteredBranches.map((b) => (
                    <option key={b.id} value={b.id}>{b.branch_name_en} ({b.branch_code})</option>
                  ))}
                </select>
              </div>
            </div>
          </ERPRecordSectionPanel>

          {/* â”€â”€ ADD ONLY: Initial Role â”€â”€ */}
          {mode === "add" && (
            <ERPRecordSectionPanel id="role" activeId={activeSection} title="Initial Security Role">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="initial_role_id" className="text-muted-foreground text-xs">Primary Role</Label>
                  <select id="initial_role_id" name="initial_role_id" className={selectClass}>
                    <option value="">No initial role (Read-only)</option>
                    {roles.filter((r) => r.is_active).map((r) => (
                      <option key={r.id} value={r.id}>{r.role_name} ({r.role_code})</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="initial_role_scope_company_id" className="text-muted-foreground text-xs">Role Scope: Company</Label>
                  <select id="initial_role_scope_company_id" name="initial_role_scope_company_id" className={selectClass}>
                    <option value="">Global Scope (All Companies)</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.legal_name_en}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="initial_role_scope_branch_id" className="text-muted-foreground text-xs">Role Scope: Branch</Label>
                  <select id="initial_role_scope_branch_id" name="initial_role_scope_branch_id" className={selectClass}>
                    <option value="">Global Scope (All Branches)</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.branch_name_en} ({b.branch_code})</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-12 flex gap-2.5 p-3 rounded-lg border border-border bg-muted/20">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground leading-normal font-medium">
                    Leave scopes empty for default access. Select a company to enforce company-wide policies, or select a branch for granular access checks.
                  </p>
                </div>
              </div>
            </ERPRecordSectionPanel>
          )}

          {/* â”€â”€ EDIT/VIEW: Current Roles â”€â”€ */}
          {mode !== "add" && (
            <ERPRecordSectionPanel id="roles" activeId={activeSection} title="Assigned Roles">
              <div className="space-y-3">
                {user?.roles && user.roles.length > 0 ? (
                  <div className="space-y-2">
                    {user.roles.map((r) => (
                      <div key={r.role_code} className="flex items-center justify-between px-3 py-2 rounded-md border border-border bg-muted/30 text-xs">
                        <span className="font-medium">{r.role_name}</span>
                        <span className="font-mono text-muted-foreground">{r.role_code}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No roles assigned.</p>
                )}
                {!isViewing && user && (
                  <button
                    type="button"
                    onClick={() => setAssignRoleOpen(true)}
                    className="text-xs text-indigo-600 hover:underline font-medium"
                  >
                    + Assign Role
                  </button>
                )}
              </div>
            </ERPRecordSectionPanel>
          )}

          {/* â”€â”€ EDIT/VIEW: Audit Info â”€â”€ */}
          {mode !== "add" && (
            <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
              {user ? (
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-6 space-y-1">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <div className="text-sm">{format(new Date(user.created_at), "yyyy-MM-dd HH:mm:ss")}</div>
                  </div>
                  <div className="col-span-6 space-y-1">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <div className="text-sm">{format(new Date(user.updated_at), "yyyy-MM-dd HH:mm:ss")}</div>
                  </div>
                  <div className="col-span-6 space-y-1">
                    <Label className="text-muted-foreground text-xs">Last Admin Update</Label>
                    <div className="text-sm">{user.last_admin_updated_at ? format(new Date(user.last_admin_updated_at), "yyyy-MM-dd HH:mm:ss") : "â€”"}</div>
                  </div>
                  <div className="col-span-6 space-y-1">
                    <Label className="text-muted-foreground text-xs">Auth User ID</Label>
                    <div className="text-xs font-mono text-muted-foreground truncate">{user.auth_user_id}</div>
                  </div>
                  <div className="col-span-6 space-y-1">
                    <Label className="text-muted-foreground text-xs">Preferred Language</Label>
                    <div className="text-sm">{user.preferred_language ?? "en"}</div>
                  </div>
                  <div className="col-span-6 space-y-1">
                    <Label className="text-muted-foreground text-xs">Timezone</Label>
                    <div className="text-sm">{user.timezone ?? "UTC"}</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Audit information available after saving.</p>
              )}
            </ERPRecordSectionPanel>
          )}
        </form>
      </ERPRecordWorkspaceForm>

      {/* Assign Role child dialog â€” stays as ERPChildDialogForm (correct pattern) */}
      {user && (
        <AssignRoleDialog
          user={user}
          open={assignRoleOpen}
          onOpenChange={setAssignRoleOpen}
          roles={roles}
          companies={companies}
          branches={branches}
        />
      )}
    </>
  );
}
