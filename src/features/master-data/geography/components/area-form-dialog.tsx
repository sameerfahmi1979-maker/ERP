"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { AreaZoneWithRelations } from "@/features/master-data/geography/types";
import { createAreaZone, updateAreaZone } from "@/features/master-data/geography/actions";
import { CitySelect } from "@/components/erp/geography";
import { LookupSelect } from "@/components/erp/lookup-select";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateAreas } from "@/lib/query/invalidation";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import {
  Map,
  Shield,
  Info,
} from "lucide-react";

type AreaFormDialogProps = {
  area?: AreaZoneWithRelations | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AreaFormDialog({
  area,
  mode,
  open,
  onOpenChange,
}: AreaFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [cityId, setCityId] = useState<number | null>(area?.city_id ?? null);
  const [areaTypeCode, setAreaTypeCode] = useState<string | null>(area?.area_type_code ?? null);
  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const queryClient = useQueryClient();
  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  // Reset state when form opens or area changes
  useEffect(() => {
    if (open) {
      setCityId(area?.city_id ?? null);
      setAreaTypeCode(area?.area_type_code ?? null);
      setActiveSection("basic");
    }
  }, [open, area?.id, area?.city_id, area?.area_type_code]);

  const handleAreaTypeChange = (value: string | number | null) => {
    setAreaTypeCode(value ? String(value) : null);
  };

  const sections = [
    { id: "basic", label: "Basic Info", icon: Map },
    { id: "status", label: "Status & Governance", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    
    if (isViewing) return;

    if (!cityId) {
      toast.error("Please select a city");
      return false;
    }

    const form = document.getElementById("drawer-form") as HTMLFormElement;
    const formData = new FormData(form);

    setIsSubmitting(true);
    try {
      let result;
      if (isEditing && area) {
        const data = {
          id: area.id,
          name_en: formData.get("name_en") as string,
          name_ar: (formData.get("name_ar") as string) || null,
          city_id: cityId,
          area_type_code: areaTypeCode || null,
          is_active: formData.get("is_active") === "on",
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
        };
        result = await updateAreaZone(data);
      } else {
        const data = {
          area_code: (formData.get("area_code") as string).toUpperCase(),
          name_en: formData.get("name_en") as string,
          name_ar: (formData.get("name_ar") as string) || null,
          city_id: cityId,
          area_type_code: areaTypeCode || null,
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
        };
        result = await createAreaZone(data);
      }

      if (result.success) {
        toast.success(`Area ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        invalidateAreas(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save area");
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
          ? "View Area"
          : isEditing
          ? "Edit Area"
          : "Add Area"
      }
      subtitle={area ? `Area: ${area.name_en} (${area.area_code})` : "Create a new area/zone record"}
      recordNumber={area ? area.area_code : undefined}
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
                  <RequiredLabel htmlFor="area_code">Area Code</RequiredLabel>
                  <Input
                    id="area_code"
                    name="area_code"
                    required
                    defaultValue={area?.area_code}
                    disabled={isViewing || isEditing}
                    placeholder="JAFZA"
                    className="uppercase"
                    maxLength={50}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Unique area identifier (uppercase, alphanumeric with underscores)
                  </span>
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="area_type_code" className="text-muted-foreground text-xs">
                    Area Type
                  </Label>
                  <LookupSelect
                    categoryCode="AREA_TYPES"
                    value={areaTypeCode}
                    onValueChange={handleAreaTypeChange}
                    disabled={isViewing}
                    placeholder="Select area type"
                    valueField="code"
                  />
                </div>

                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="name_en">English Name</RequiredLabel>
                  <Input
                    id="name_en"
                    name="name_en"
                    required
                    defaultValue={area?.name_en}
                    disabled={isViewing}
                    placeholder="Jebel Ali Free Zone"
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
                    defaultValue={area?.name_ar ?? ""}
                    disabled={isViewing}
                    placeholder="منطقة جبل علي الحرة"
                    maxLength={255}
                    dir="rtl"
                  />
                </div>

                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="city_id">City</RequiredLabel>
                  <CitySelect
                    value={cityId}
                    onValueChange={setCityId}
                    disabled={isViewing}
                    required
                    placeholder="Select city"
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
                    defaultValue={area?.sort_order ?? 0}
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
                          defaultChecked={area?.is_active ?? true}
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
                        {area?.is_system && (
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 text-xs font-medium">
                            <Shield className="h-3 w-3 mr-1" />
                            System Record
                          </span>
                        )}
                        {area?.is_locked && (
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-destructive/10 text-destructive text-xs font-medium">
                            Locked
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {area?.is_system && (
                  <div className="col-span-12">
                    <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-start gap-2">
                        <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div className="text-xs text-amber-800 dark:text-amber-300">
                          <strong>System Area:</strong> This is a protected system area seeded during installation. Exercise caution when modifying.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 3 — Audit Info (Read-only) */}
            <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
              {area ? (
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input value={new Date(area.created_at).toLocaleString()} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input value={new Date(area.updated_at).toLocaleString()} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created By</Label>
                    <Input value={area.created_by?.toString() ?? "—"} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated By</Label>
                    <Input value={area.updated_by?.toString() ?? "—"} disabled className="text-xs" />
                  </div>

                  {area.deactivated_at && (
                    <>
                      <div className="space-y-2 col-span-6">
                        <Label className="text-muted-foreground text-xs">Deactivated At</Label>
                        <Input value={new Date(area.deactivated_at).toLocaleString()} disabled className="text-xs" />
                      </div>

                      <div className="space-y-2 col-span-6">
                        <Label className="text-muted-foreground text-xs">Deactivated By</Label>
                        <Input value={area.deactivated_by?.toString() ?? "—"} disabled className="text-xs" />
                      </div>

                      {area.deactivation_reason && (
                        <div className="space-y-2 col-span-12">
                          <Label className="text-muted-foreground text-xs">Deactivation Reason</Label>
                          <Input value={area.deactivation_reason} disabled className="text-xs" />
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
