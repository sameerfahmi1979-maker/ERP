"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, ShieldAlert, User, Shield, Building2, Key } from "lucide-react";
import { toast } from "sonner";
import type { OwnerCompany, Branch, Role } from "@/types/database";
import { createUser } from "@/server/actions/users";
import { 
  ERPDrawerForm, 
  ERPDrawerSectionNav, 
  ERPDrawerBody, 
  ERPDrawerSection, 
  ERPFieldGrid
} from "@/components/erp/erp-drawer-form";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import { RequiredLabel } from "@/components/erp/required-label";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { Label } from "@/components/ui/label";

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
  const [activeSection, setActiveSection] = useState("auth");

  const formId = "add-user-drawer-form";

  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: formId,
    enabled: true,
  });

  // Filter branches by selected company
  const filteredBranches = selectedCompanyId
    ? branches.filter((b) => b.owner_company_id === selectedCompanyId)
    : branches;

  const sections = [
    { id: "auth", label: "Authentication", icon: Key },
    { id: "profile", label: "Profile Details", icon: User },
    { id: "assignment", label: "Organization", icon: Building2 },
    { id: "role", label: "Initial Role", icon: Shield },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);

    const form = document.getElementById(formId) as HTMLFormElement;
    const formData = new FormData(form);
    
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
        form.reset();
        setSendInvite(true);
        setSelectedCompanyId(null);
        resetDirty();
        return true;
      } else {
        toast.error(result.error || "Failed to create user");
        return false;
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndClose = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    const success = await handleSave();
    if (success) {
      setOpen(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Default form submission is "Save & Close"
    await handleSaveAndClose();
  };

  return (
    <>
      <Button size="sm" className="h-9 text-xs gap-1.5 font-semibold" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Add User
      </Button>

      <ERPDrawerForm
        open={open}
        onOpenChange={setOpen}
        title="Add New User Account"
        subtitle="Provision access credentials and administrative permissions for employees"
        mode="add"
        isDirty={isDirty}
        onPrint={() => window.print()}
        onExportPDF={() => toast.info("PDF export initiated...")}
        onExportExcel={() => toast.info("Excel export initiated...")}
        onExportCSV={() => toast.info("CSV export initiated...")}
        onSendEmail={() => toast.info("Email share panel will trigger in next release.")}
      >
        <form id={formId} onSubmit={handleSubmit} className="flex flex-1 overflow-hidden h-full">
          {/* Left Side Section Nav */}
          <ERPDrawerSectionNav
            sections={sections}
            activeSection={activeSection}
            setActiveSection={setActiveSection}
          />

          {/* Right Side Content Canvas */}
          <div className="flex-grow flex flex-col justify-between overflow-hidden">
            <ERPDrawerBody>
              {/* Section 1: Authentication */}
              <ERPDrawerSection id="auth" activeId={activeSection} title="Identity & Authentication">
                <ERPFieldGrid>
                  <div className="col-span-12 flex items-center justify-between border border-border p-3 rounded-lg bg-muted/30 mb-2">
                    <div className="space-y-0.5">
                      <Label htmlFor="send_invite" className="cursor-pointer text-xs font-semibold text-foreground">Send Invite Email</Label>
                      <p className="text-[10px] text-muted-foreground">Automatically dispatch login instructions to user's email inbox.</p>
                    </div>
                    <Checkbox
                      id="send_invite"
                      checked={sendInvite}
                      onCheckedChange={(checked) => setSendInvite(checked === true)}
                      className="border-input bg-background text-foreground data-[state=checked]:bg-indigo-600 data-[state=checked]:text-white"
                    />
                  </div>

                  <div className="col-span-12 space-y-1.5">
                    <RequiredLabel htmlFor="email" className="text-muted-foreground text-xs" required>
                      Email Address
                    </RequiredLabel>
                    <Input
                      type="email"
                      id="email"
                      name="email"
                      required
                      placeholder="user@example.com"
                      className="h-9 text-xs"
                    />
                  </div>

                  {!sendInvite && (
                    <div className="col-span-12 space-y-1.5">
                      <RequiredLabel htmlFor="temporary_password" className="text-muted-foreground text-xs" required>
                        Temporary Password
                      </RequiredLabel>
                      <Input
                        type="password"
                        id="temporary_password"
                        name="temporary_password"
                        required={!sendInvite}
                        placeholder="Minimum 8 characters"
                        minLength={8}
                        className="h-9 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        User will be required to change password on first login
                      </p>
                    </div>
                  )}
                </ERPFieldGrid>
              </ERPDrawerSection>

              {/* Section 2: Profile Info */}
              <ERPDrawerSection id="profile" activeId={activeSection} title="Personal Profile details">
                <ERPFieldGrid>
                  <div className="col-span-6 space-y-1.5">
                    <RequiredLabel htmlFor="full_name" className="text-muted-foreground text-xs" required>
                      Full Name
                    </RequiredLabel>
                    <Input id="full_name" name="full_name" required className="h-9 text-xs" />
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <RequiredLabel htmlFor="display_name" className="text-muted-foreground text-xs">
                      Display Name
                    </RequiredLabel>
                    <Input id="display_name" name="display_name" className="h-9 text-xs" />
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <RequiredLabel htmlFor="phone" className="text-muted-foreground text-xs">
                      Phone Number
                    </RequiredLabel>
                    <Input id="phone" name="phone" placeholder="+971 XX XXX XXXX" className="h-9 text-xs" />
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <RequiredLabel htmlFor="status" className="text-muted-foreground text-xs">
                      User Status
                    </RequiredLabel>
                    <select
                      id="status"
                      name="status"
                      defaultValue="active"
                      className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <RequiredLabel htmlFor="job_title" className="text-muted-foreground text-xs">
                      Job Title
                    </RequiredLabel>
                    <Input id="job_title" name="job_title" className="h-9 text-xs" />
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <RequiredLabel htmlFor="department" className="text-muted-foreground text-xs">
                      Department
                    </RequiredLabel>
                    <Input id="department" name="department" className="h-9 text-xs" />
                  </div>
                </ERPFieldGrid>
              </ERPDrawerSection>

              {/* Section 3: Organization Assignment */}
              <ERPDrawerSection id="assignment" activeId={activeSection} title="Organization & Branch Linkage">
                <ERPFieldGrid>
                  <div className="col-span-6 space-y-1.5">
                    <RequiredLabel htmlFor="owner_company_id" className="text-muted-foreground text-xs">
                      Parent Company
                    </RequiredLabel>
                    <select
                      id="owner_company_id"
                      name="owner_company_id"
                      value={selectedCompanyId ?? ""}
                      onChange={(e) => setSelectedCompanyId(e.target.value ? Number(e.target.value) : null)}
                      className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Select company...</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.legal_name_en} ({company.company_code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <RequiredLabel htmlFor="branch_id" className="text-muted-foreground text-xs">
                      Assigned Branch
                    </RequiredLabel>
                    <select
                      id="branch_id"
                      name="branch_id"
                      disabled={!selectedCompanyId}
                      className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40"
                    >
                      <option value="">Select branch...</option>
                      {filteredBranches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.branch_name_en} ({branch.branch_code})
                        </option>
                      ))}
                    </select>
                  </div>
                </ERPFieldGrid>
              </ERPDrawerSection>

              {/* Section 4: Initial Role Assignment */}
              <ERPDrawerSection id="role" activeId={activeSection} title="Administrative Security Role">
                <ERPFieldGrid>
                  <div className="col-span-12 space-y-1.5">
                    <RequiredLabel htmlFor="initial_role_id" className="text-muted-foreground text-xs">
                      Primary Role
                    </RequiredLabel>
                    <select
                      id="initial_role_id"
                      name="initial_role_id"
                      className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">No initial role (Read-only)</option>
                      {roles
                        .filter((r) => r.is_active)
                        .map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.role_name} ({role.role_code})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <RequiredLabel htmlFor="initial_role_scope_company_id" className="text-muted-foreground text-xs">
                      Role Scope: Company
                    </RequiredLabel>
                    <select
                      id="initial_role_scope_company_id"
                      name="initial_role_scope_company_id"
                      className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Global Scope (All Companies)</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.legal_name_en}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <RequiredLabel htmlFor="initial_role_scope_branch_id" className="text-muted-foreground text-xs">
                      Role Scope: Branch
                    </RequiredLabel>
                    <select
                      id="initial_role_scope_branch_id"
                      name="initial_role_scope_branch_id"
                      className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Global Scope (All Branches)</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.branch_name_en} ({branch.branch_code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-12 flex gap-2.5 p-3 rounded-lg border border-border bg-muted/20 mt-2">
                    <ShieldAlert className="h-4.5 w-4.5 shrink-0 text-indigo-500" />
                    <p className="text-[10px] text-muted-foreground leading-normal font-medium">
                      Leave scopes empty for default access. Select a company to enforce company-wide policies, or select a branch for granular access checks.
                    </p>
                  </div>
                </ERPFieldGrid>
              </ERPDrawerSection>
            </ERPDrawerBody>

            {/* Sticky Footer */}
            <ERPFormFooter
              mode="add"
              formId={formId}
              onCancel={() => setOpen(false)}
              onSave={() => handleSave()}
              onSaveAndClose={() => handleSaveAndClose()}
              isSubmitting={isSubmitting}
              hasUnsavedChanges={isDirty}
            />
          </div>
        </form>
      </ERPDrawerForm>
    </>
  );
}
