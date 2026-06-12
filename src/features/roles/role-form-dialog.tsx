"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Role } from "@/types/database";
import { createRole, updateRole } from "@/server/actions/roles";
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
import { Shield, ShieldAlert } from "lucide-react";

type RoleFormDialogProps = {
  role?: Role | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RoleFormDialog({ role, open, onOpenChange }: RoleFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = Boolean(role);

  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: "role-drawer-form",
    enabled: true,
  });

  const sections = [
    { id: "basic", label: "Basic Details", icon: Shield },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);

    const form = document.getElementById("role-drawer-form") as HTMLFormElement;
    const formData = new FormData(form);
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
        resetDirty();
        return true;
      } else {
        toast.error(result.error || "Failed to save role");
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

  const formId = "role-drawer-form";

  return (
    <ERPDrawerForm
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit Role Settings" : "Create New Role"}
      subtitle={isEditing ? `Modify structural configuration for ${role?.role_name}` : "Define a new security role with custom scopes"}
      mode={isEditing ? "edit" : "add"}
      recordNumber={role?.role_code}
      status={role?.is_active !== false ? "active" : "inactive"}
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
          auditInfo={isEditing ? {
            updatedAt: "Recent update",
            updatedBy: "System Admin"
          } : undefined}
        />

        {/* Right Side Content Canvas */}
        <div className="flex-grow flex flex-col justify-between overflow-hidden">
          <ERPDrawerBody>
            {/* Section 1: Basic Role Details */}
            <ERPDrawerSection id="basic" activeId={activeSection} title="Role configurations">
              <ERPFieldGrid>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="role_code" className="text-muted-foreground text-xs" required>
                    Role Code
                  </RequiredLabel>
                  <Input
                    id="role_code"
                    name="role_code"
                    className="h-9 text-xs lowercase"
                    defaultValue={role?.role_code}
                    disabled={isEditing}
                    required
                    placeholder="e.g., fleet_manager"
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="role_name" className="text-muted-foreground text-xs" required>
                    Role Name
                  </RequiredLabel>
                  <Input 
                    id="role_name" 
                    name="role_name" 
                    className="h-9 text-xs"
                    defaultValue={role?.role_name} 
                    required 
                  />
                </div>
                <div className="col-span-12 space-y-1.5">
                  <RequiredLabel htmlFor="description" className="text-muted-foreground text-xs">
                    Description
                  </RequiredLabel>
                  <Textarea 
                    id="description" 
                    name="description" 
                    className="text-xs"
                    defaultValue={role?.description ?? ""} 
                    rows={4} 
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="is_system_role" className="text-muted-foreground text-xs">
                    Type
                  </RequiredLabel>
                  <select
                    id="is_system_role"
                    name="is_system_role"
                    defaultValue={role?.is_system_role ? "true" : "false"}
                    disabled={role?.is_system_role}
                    className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40"
                  >
                    <option value="false">Custom</option>
                    <option value="true">System</option>
                  </select>
                </div>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="is_active" className="text-muted-foreground text-xs">
                    Status
                  </RequiredLabel>
                  <select
                    id="is_active"
                    name="is_active"
                    defaultValue={role?.is_active !== false ? "true" : "false"}
                    className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
                <div className="col-span-12 flex gap-2.5 p-3 rounded-lg border border-border bg-muted/20 mt-4">
                  <ShieldAlert className="h-4.5 w-4.5 shrink-0 text-indigo-500" />
                  <p className="text-[10px] text-muted-foreground leading-normal font-medium">
                    System roles are read-only policies configured by default engine controllers. Custom roles can be managed and deleted freely.
                  </p>
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>
          </ERPDrawerBody>

          {/* Sticky Footer */}
          <ERPFormFooter
            mode={isEditing ? "edit" : "add"}
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
