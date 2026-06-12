"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { UserWithRoles, OwnerCompany, Branch } from "@/types/database";
import { adminUpdateUserProfile } from "@/server/actions/users";
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
import { User, Building2 } from "lucide-react";

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
  const [activeSection, setActiveSection] = useState("profile");

  const formId = "edit-user-drawer-form";

  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: formId,
    enabled: true,
  });

  const sections = [
    { id: "profile", label: "Profile Details", icon: User },
    { id: "assignment", label: "Corporate Assignment", icon: Building2 },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);

    const form = document.getElementById(formId) as HTMLFormElement;
    const formData = new FormData(form);
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
        resetDirty();
        return true;
      } else {
        toast.error(result.error || "Failed to update user profile");
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
      onOpenChange(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Default form submission is "Save & Close"
    await handleSaveAndClose();
  };

  return (
    <ERPDrawerForm
      open={open}
      onOpenChange={onOpenChange}
      title="Edit User Profile"
      subtitle={`Modify profile details and assignments for ${user.full_name || user.email}`}
      mode="edit"
      status={user.status}
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
            {/* Section 1: Profile Information */}
            <ERPDrawerSection id="profile" activeId={activeSection} title="Personal details">
              <ERPFieldGrid>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="full_name" className="text-muted-foreground text-xs" required>
                    Full Name
                  </RequiredLabel>
                  <Input id="full_name" name="full_name" className="h-9 text-xs" defaultValue={user.full_name ?? ""} />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="display_name" className="text-muted-foreground text-xs">
                    Display Name
                  </RequiredLabel>
                  <Input id="display_name" name="display_name" className="h-9 text-xs" defaultValue={user.display_name ?? ""} />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="phone" className="text-muted-foreground text-xs">
                    Phone
                  </RequiredLabel>
                  <Input id="phone" name="phone" className="h-9 text-xs" defaultValue={user.phone ?? ""} />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="status" className="text-muted-foreground text-xs">
                    Status
                  </RequiredLabel>
                  <select id="status" name="status" defaultValue={user.status} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="job_title" className="text-muted-foreground text-xs">
                    Job Title
                  </RequiredLabel>
                  <Input id="job_title" name="job_title" className="h-9 text-xs" defaultValue={user.job_title ?? ""} />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="department" className="text-muted-foreground text-xs">
                    Department
                  </RequiredLabel>
                  <Input id="department" name="department" className="h-9 text-xs" defaultValue={user.department ?? ""} />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 2: Corporate Assignment */}
            <ERPDrawerSection id="assignment" activeId={activeSection} title="Organization Linkage">
              <ERPFieldGrid>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="owner_company_id" className="text-muted-foreground text-xs">
                    Organization
                  </RequiredLabel>
                  <select id="owner_company_id" name="owner_company_id" defaultValue={user.owner_company_id ?? ""} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="">None</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.legal_name_en}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="branch_id" className="text-muted-foreground text-xs">
                    Branch
                  </RequiredLabel>
                  <select id="branch_id" name="branch_id" defaultValue={user.branch_id ?? ""} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="">None</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.branch_name_en}</option>
                    ))}
                  </select>
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>
          </ERPDrawerBody>

          {/* Sticky Footer */}
          <ERPFormFooter
            mode="edit"
            formId={formId}
            onCancel={() => onOpenChange(false)}
            onSave={() => handleSave()}
            onSaveAndClose={() => handleSaveAndClose()}
            isSubmitting={isSubmitting}
            hasUnsavedChanges={isDirty}
          />
        </div>
      </form>
    </ERPDrawerForm>
  );
}
