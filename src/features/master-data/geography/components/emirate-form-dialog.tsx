"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { Emirate } from "@/features/master-data/geography/types";
import { createEmirate, updateEmirate } from "@/features/master-data/geography/actions";
import { CountrySelect } from "@/components/erp/geography";
import { LookupSelect } from "@/components/erp/lookup-select";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateEmirates } from "@/lib/query/invalidation";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import {
  MapPin,
  Shield,
  Info,
} from "lucide-react";

type EmirateFormDialogProps = {
  emirate?: Emirate | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EmirateFormDialog({
  emirate,
  mode,
  open,
  onOpenChange,
}: EmirateFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [countryId, setCountryId] = useState<number | null>(emirate?.country_id ?? null);
  const [regionTypeCode, setRegionTypeCode] = useState<string | null>(emirate?.region_type_code ?? null);
  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const queryClient = useQueryClient();
  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  // Reset state when form opens or emirate changes
  useEffect(() => {
    if (open) {
      setCountryId(emirate?.country_id ?? null);
      setRegionTypeCode(emirate?.region_type_code ?? null);
      setActiveSection("basic");
    }
  }, [open, emirate?.id, emirate?.country_id, emirate?.region_type_code]);

  const handleRegionTypeChange = (value: string | number | null) => {
    setRegionTypeCode(value ? String(value) : null);
  };

  const sections = [
    { id: "basic", label: "Basic Info", icon: MapPin },
    { id: "status", label: "Status & Governance", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    
    if (isViewing) return;

    const form = document.getElementById("drawer-form") as HTMLFormElement;
    const formData = new FormData(form);

    setIsSubmitting(true);
    try {
      let result;
      if (isEditing && emirate) {
        const data = {
          id: emirate.id,
          name_en: formData.get("name_en") as string,
          name_ar: (formData.get("name_ar") as string) || null,
          abbreviation_en: formData.get("abbreviation_en") as string,
          abbreviation_ar: (formData.get("abbreviation_ar") as string) || null,
          country_id: countryId,
          region_type_code: regionTypeCode,
          is_active: formData.get("is_active") === "on",
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
        };
        result = await updateEmirate(data);
      } else {
        const data = {
          emirate_code: (formData.get("emirate_code") as string).toUpperCase(),
          name_en: formData.get("name_en") as string,
          name_ar: (formData.get("name_ar") as string) || null,
          abbreviation_en: formData.get("abbreviation_en") as string,
          abbreviation_ar: (formData.get("abbreviation_ar") as string) || null,
          country_id: countryId,
          region_type_code: regionTypeCode,
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
        };
        result = await createEmirate(data);
      }

      if (result.success) {
        toast.success(`Region ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        invalidateEmirates(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save region");
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
          ? "View Region / Emirate"
          : isEditing
          ? "Edit Region / Emirate"
          : "Add Region / Emirate"
      }
      subtitle={emirate ? `Region: ${emirate.name_en} (${emirate.emirate_code})` : "Create a new administrative region record"}
      recordNumber={emirate ? emirate.emirate_code : undefined}
      mode={isViewing ? "view" : isEditing ? "edit" : "add"}
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
                  <Label htmlFor="country_id" className="text-muted-foreground text-xs">
                    Country *
                  </Label>
                  <CountrySelect
                    value={countryId}
                    onValueChange={setCountryId}
                    disabled={isViewing}
                    required
                    placeholder="Select country"
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Country for this administrative region
                  </span>
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="region_type_code" className="text-muted-foreground text-xs">
                    Region Type *
                  </Label>
                  <LookupSelect
                    categoryCode="REGION_TYPES"
                    value={regionTypeCode}
                    onValueChange={handleRegionTypeChange}
                    disabled={isViewing}
                    required
                    placeholder="Select type (Emirate, Governorate, State, etc.)"
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Type of administrative region (Emirate, Governorate, State, Province, Region)
                  </span>
                </div>

                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="emirate_code">Region Code</RequiredLabel>
                  <Input
                    id="emirate_code"
                    name="emirate_code"
                    required
                    defaultValue={emirate?.emirate_code}
                    disabled={isViewing || isEditing}
                    placeholder="AUH"
                    className="uppercase"
                    maxLength={3}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    3-character unique code (e.g., AUH, AMM, CAL)
                  </span>
                </div>

                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="abbreviation_en">Abbreviation</RequiredLabel>
                  <Input
                    id="abbreviation_en"
                    name="abbreviation_en"
                    required
                    defaultValue={emirate?.abbreviation_en}
                    disabled={isViewing}
                    placeholder="AD"
                    className="uppercase"
                    maxLength={10}
                  />
                </div>

                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="name_en">English Name</RequiredLabel>
                  <Input
                    id="name_en"
                    name="name_en"
                    required
                    defaultValue={emirate?.name_en}
                    disabled={isViewing}
                    placeholder="Abu Dhabi"
                    maxLength={255}
                  />
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="name_ar" className="text-muted-foreground text-xs">
                    Arabic Name
                  </Label>
                  <Input
                    id="name_ar"
                    name="name_ar"
                    defaultValue={emirate?.name_ar ?? ""}
                    disabled={isViewing}
                    placeholder="أبو ظبي"
                    maxLength={255}
                    dir="rtl"
                  />
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="abbreviation_ar" className="text-muted-foreground text-xs">
                    Arabic Abbreviation
                  </Label>
                  <Input
                    id="abbreviation_ar"
                    name="abbreviation_ar"
                    defaultValue={emirate?.abbreviation_ar ?? ""}
                    disabled={isViewing}
                    placeholder="أظ"
                    maxLength={10}
                    dir="rtl"
                  />
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
                    defaultValue={emirate?.sort_order ?? 0}
                    disabled={isViewing}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Lower numbers appear first in dropdowns
                  </span>
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 2 — Status & Governance */}
            <ERPDrawerSection id="status" activeId={activeSection} title="Status & Governance">
              <ERPFieldGrid>
                {!isEditing && !isViewing && (
                  <div className="space-y-2 col-span-12">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="is_active"
                        name="is_active"
                        defaultChecked={true}
                      />
                      <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">
                        Active
                      </Label>
                    </div>
                  </div>
                )}

                {(isEditing || isViewing) && (
                  <>
                    <div className="space-y-2 col-span-6">
                      <Label htmlFor="is_active" className="text-muted-foreground text-xs">
                        Status
                      </Label>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="is_active"
                          name="is_active"
                          defaultChecked={emirate?.is_active ?? true}
                          disabled={isViewing}
                        />
                        <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">
                          Active
                        </Label>
                      </div>
                    </div>

                    <div className="col-span-6 space-y-2">
                      <Label className="text-muted-foreground text-xs">System Flags</Label>
                      <div className="flex gap-2">
                        {emirate?.is_system && (
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 text-xs font-medium">
                            <Shield className="h-3 w-3 mr-1" />
                            System Record
                          </span>
                        )}
                        {emirate?.is_locked && (
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-destructive/10 text-destructive text-xs font-medium">
                            Locked
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {emirate?.is_system && (
                  <div className="col-span-12">
                    <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-start gap-2">
                        <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div className="text-xs text-amber-800 dark:text-amber-300">
                          <strong>System Emirate:</strong> This is a protected system emirate seeded during installation. Exercise caution when modifying.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 3 — Audit Info (Read-only) */}
            <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
              {emirate ? (
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input value={new Date(emirate.created_at).toLocaleString()} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input value={new Date(emirate.updated_at).toLocaleString()} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created By</Label>
                    <Input value={emirate.created_by?.toString() ?? "—"} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated By</Label>
                    <Input value={emirate.updated_by?.toString() ?? "—"} disabled className="text-xs" />
                  </div>

                  {emirate.deactivated_at && (
                    <>
                      <div className="space-y-2 col-span-6">
                        <Label className="text-muted-foreground text-xs">Deactivated At</Label>
                        <Input value={new Date(emirate.deactivated_at).toLocaleString()} disabled className="text-xs" />
                      </div>

                      <div className="space-y-2 col-span-6">
                        <Label className="text-muted-foreground text-xs">Deactivated By</Label>
                        <Input value={emirate.deactivated_by?.toString() ?? "—"} disabled className="text-xs" />
                      </div>

                      {emirate.deactivation_reason && (
                        <div className="space-y-2 col-span-12">
                          <Label className="text-muted-foreground text-xs">Deactivation Reason</Label>
                          <Input value={emirate.deactivation_reason} disabled className="text-xs" />
                        </div>
                      )}
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
