"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { LookupCategory } from "@/features/master-data/lookups/types";
import { createLookupCategory, updateLookupCategory } from "@/server/actions/master-data/lookups";
import { RequiredLabel } from "@/components/erp/required-label";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import {
  Folder,
  Settings,
  Shield,
  Info,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateAllLookups } from "@/lib/query/invalidation";

type CategoryFormDialogProps = {
  category?: LookupCategory | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CategoryFormDialog({
  category,
  mode,
  open,
  onOpenChange,
}: CategoryFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const queryClient = useQueryClient();
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  const sections = [
    { id: "basic", label: "Basic Info", icon: Folder },
    { id: "scope", label: "Scope & Behavior", icon: Settings },
    { id: "status", label: "Status & Governance", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    
    if (isViewing) return;

    const form = document.getElementById("drawer-form") as HTMLFormElement;
    const formData = new FormData(form);

    setIsSubmitting(true);

    // Build data object
    const data = {
      category_code: (formData.get("category_code") as string).toUpperCase(),
      category_name_en: formData.get("category_name_en") as string,
      category_name_ar: (formData.get("category_name_ar") as string) || null,
      description: (formData.get("description") as string) || null,
      module_code: (formData.get("module_code") as string) || null,
      category_scope: (formData.get("category_scope") as "GLOBAL" | "COMPANY" | "BRANCH" | "MODULE") || "GLOBAL",
      supports_hierarchy: formData.get("supports_hierarchy") === "on",
      supports_color: formData.get("supports_color") === "on",
      supports_icon: formData.get("supports_icon") === "on",
      supports_effective_dates: formData.get("supports_effective_dates") === "on",
      supports_metadata: formData.get("supports_metadata") === "on",
      is_active: formData.get("is_active") === "on",
      is_locked: formData.get("is_locked") === "on",
      sort_order: parseInt(formData.get("sort_order") as string) || 0,
    };

    try {
      let result;
      if (isEditing && category) {
        result = await updateLookupCategory({ id: category.id, ...data });
      } else {
        result = await createLookupCategory(data);
      }

      if (result.success) {
        toast.success(`Lookup category ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        invalidateAllLookups(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save lookup category");
        return false;
      }
    } catch (error) {
      console.error("Form submission error", error);
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
    await handleSaveAndClose();
  };

  return (
    <ERPDrawerForm
      open={open}
      onOpenChange={onOpenChange}
      title={
        isViewing
          ? "View Lookup Category"
          : isEditing
          ? "Edit Lookup Category"
          : "Add Lookup Category"
      }
      subtitle={category ? `Category Code: ${category.category_code}` : "Create a new lookup category"}
      recordNumber={category ? category.category_code : undefined}
      mode={mode}
      isDirty={isDirty}
    >
      <form id="drawer-form" onSubmit={handleSubmit} className="flex flex-1 overflow-hidden h-full">
        <ERPDrawerSectionNav
          sections={sections}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
        />

        <div className="flex-grow flex flex-col justify-between overflow-hidden">
          <ERPDrawerBody>
            {/* Section 1 — Basic Information */}
            <ERPDrawerSection id="basic" activeId={activeSection} title="Basic Information">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="category_code">
                    Category Code
                  </RequiredLabel>
                  <Input
                    id="category_code"
                    name="category_code"
                    required
                    defaultValue={category?.category_code}
                    disabled={isViewing || isEditing}
                    placeholder="STATUS_TYPES"
                    className="uppercase"
                    maxLength={100}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Unique identifier (uppercase, alphanumeric with underscores)
                  </span>
                </div>

                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="category_name_en">
                    English Name
                  </RequiredLabel>
                  <Input
                    id="category_name_en"
                    name="category_name_en"
                    required
                    defaultValue={category?.category_name_en}
                    disabled={isViewing}
                    placeholder="Status Types"
                    maxLength={200}
                  />
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="category_name_ar" className="text-muted-foreground text-xs">
                    Arabic Name
                  </Label>
                  <Input
                    id="category_name_ar"
                    name="category_name_ar"
                    defaultValue={category?.category_name_ar ?? ""}
                    disabled={isViewing}
                    placeholder="أنواع الحالات"
                    maxLength={200}
                  />
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="module_code" className="text-muted-foreground text-xs">
                    Module Code
                  </Label>
                  <Input
                    id="module_code"
                    name="module_code"
                    defaultValue={category?.module_code ?? ""}
                    disabled={isViewing}
                    placeholder="HR"
                    maxLength={50}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    e.g., HR, FLEET, HSE, or leave blank for cross-module
                  </span>
                </div>

                <div className="space-y-2 col-span-12">
                  <Label htmlFor="description" className="text-muted-foreground text-xs">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    name="description"
                    defaultValue={category?.description ?? ""}
                    disabled={isViewing}
                    placeholder="Lookup values for system status states (active, inactive, etc.)"
                    maxLength={1000}
                    rows={2}
                  />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 2 — Scope and Behavior */}
            <ERPDrawerSection id="scope" activeId={activeSection} title="Scope and Behavior">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="category_scope" className="text-muted-foreground text-xs">
                    Category Scope *
                  </Label>
                  <Select 
                    name="category_scope" 
                    defaultValue={category?.category_scope ?? "GLOBAL"} 
                    disabled={isViewing}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GLOBAL">Global (System-wide)</SelectItem>
                      <SelectItem value="COMPANY">Company-specific</SelectItem>
                      <SelectItem value="BRANCH">Branch-specific</SelectItem>
                      <SelectItem value="MODULE">Module-specific</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="sort_order" className="text-muted-foreground text-xs">
                    Sort Order
                  </Label>
                  <Input
                    id="sort_order"
                    name="sort_order"
                    type="number"
                    min={0}
                    defaultValue={category?.sort_order ?? 0}
                    disabled={isViewing}
                  />
                </div>

                <div className="space-y-3 col-span-12">
                  <Label className="text-muted-foreground text-xs">Feature Flags</Label>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="supports_hierarchy"
                      name="supports_hierarchy"
                      defaultChecked={category?.supports_hierarchy ?? false}
                      disabled={isViewing}
                    />
                    <Label htmlFor="supports_hierarchy" className="text-sm font-normal cursor-pointer">
                      Supports Hierarchy (parent/child values)
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="supports_color"
                      name="supports_color"
                      defaultChecked={category?.supports_color ?? false}
                      disabled={isViewing}
                    />
                    <Label htmlFor="supports_color" className="text-sm font-normal cursor-pointer">
                      Supports Color (hex colors for badges)
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="supports_icon"
                      name="supports_icon"
                      defaultChecked={category?.supports_icon ?? false}
                      disabled={isViewing}
                    />
                    <Label htmlFor="supports_icon" className="text-sm font-normal cursor-pointer">
                      Supports Icon (icon names for UI)
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="supports_effective_dates"
                      name="supports_effective_dates"
                      defaultChecked={category?.supports_effective_dates ?? false}
                      disabled={isViewing}
                    />
                    <Label htmlFor="supports_effective_dates" className="text-sm font-normal cursor-pointer">
                      Supports Effective Dates (time-bound values)
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="supports_metadata"
                      name="supports_metadata"
                      defaultChecked={category?.supports_metadata ?? true}
                      disabled={isViewing}
                    />
                    <Label htmlFor="supports_metadata" className="text-sm font-normal cursor-pointer">
                      Supports Metadata (custom JSON data)
                    </Label>
                  </div>
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 3 — Status and Governance */}
            <ERPDrawerSection id="status" activeId={activeSection} title="Status and Governance">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="is_active" className="text-muted-foreground text-xs">
                    Status
                  </Label>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_active"
                      name="is_active"
                      defaultChecked={category?.is_active ?? true}
                      disabled={isViewing}
                    />
                    <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">
                      Active
                    </Label>
                  </div>
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="is_locked" className="text-muted-foreground text-xs">
                    Lock Status
                  </Label>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_locked"
                      name="is_locked"
                      defaultChecked={category?.is_locked ?? false}
                      disabled={isViewing}
                    />
                    <Label htmlFor="is_locked" className="text-sm font-normal cursor-pointer">
                      Locked (prevents modification)
                    </Label>
                  </div>
                </div>

                {category?.is_system && (
                  <div className="col-span-12">
                    <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-start gap-2">
                        <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div className="text-xs text-amber-800 dark:text-amber-300">
                          <strong>System Category:</strong> This is a protected system category seeded during installation. Exercise caution when modifying.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 4 — Audit Info (Read-only) */}
            <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
              {category ? (
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input value={new Date(category.created_at).toLocaleString()} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input value={new Date(category.updated_at).toLocaleString()} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created By</Label>
                    <Input value={category.created_by?.toString() ?? "—"} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated By</Label>
                    <Input value={category.updated_by?.toString() ?? "—"} disabled className="text-xs" />
                  </div>

                  {category.deactivated_at && (
                    <>
                      <div className="space-y-2 col-span-6">
                        <Label className="text-muted-foreground text-xs">Deactivated At</Label>
                        <Input value={new Date(category.deactivated_at).toLocaleString()} disabled className="text-xs" />
                      </div>

                      <div className="space-y-2 col-span-6">
                        <Label className="text-muted-foreground text-xs">Deactivated By</Label>
                        <Input value={category.deactivated_by?.toString() ?? "—"} disabled className="text-xs" />
                      </div>

                      <div className="space-y-2 col-span-12">
                        <Label className="text-muted-foreground text-xs">Deactivation Reason</Label>
                        <Textarea 
                          value={category.deactivation_reason ?? "—"} 
                          disabled 
                          className="text-xs" 
                          rows={2}
                        />
                      </div>
                    </>
                  )}
                </ERPFieldGrid>
              ) : (
                <div className="text-sm text-muted-foreground">Audit information will be available after saving</div>
              )}
            </ERPDrawerSection>
          </ERPDrawerBody>

          <ERPFormFooter
            mode={mode}
            onSave={handleSave}
            onSaveAndClose={handleSaveAndClose}
            onCancel={() => onOpenChange(false)}
            isSubmitting={isSubmitting}
            hasUnsavedChanges={isDirty}
          />
        </div>
      </form>
    </ERPDrawerForm>
  );
}
