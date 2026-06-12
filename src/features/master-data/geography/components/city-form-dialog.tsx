"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { City } from "@/features/master-data/geography/types";
import { createCity, updateCity } from "@/features/master-data/geography/actions";
import { EmirateSelect, CountrySelect } from "@/components/erp/geography";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateCities } from "@/lib/query/invalidation";
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

type CityFormDialogProps = {
  city?: City | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CityFormDialog({
  city,
  mode,
  open,
  onOpenChange,
}: CityFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [countryId, setCountryId] = useState<number | null>(city?.country_id ?? null);
  const [emirateId, setEmirateId] = useState<number | null>(city?.emirate_id ?? null);
  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const queryClient = useQueryClient();
  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  // Reset state when form opens or city changes
  useEffect(() => {
    if (open) {
      setCountryId(city?.country_id ?? null);
      setEmirateId(city?.emirate_id ?? null);
      setActiveSection("basic");
    }
  }, [open, city?.id, city?.country_id, city?.emirate_id]);

  // When the user explicitly changes country, clear emirate so they pick a valid one.
  // Using a callback (not a useEffect on countryId) prevents clearing on initial mount / form reset.
  const handleCountryChange = useCallback((newCountryId: number | null) => {
    setCountryId(newCountryId);
    setEmirateId(null);
  }, []);

  const sections = [
    { id: "basic", label: "Basic Info", icon: MapPin },
    { id: "status", label: "Status & Governance", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    
    if (isViewing) return;

    if (!emirateId) {
      toast.error("Please select a Region / Emirate / Governorate");
      return false;
    }

    const form = document.getElementById("drawer-form") as HTMLFormElement;
    const formData = new FormData(form);

    setIsSubmitting(true);
    try {
      let result;
      if (isEditing && city) {
        const data = {
          id: city.id,
          name_en: formData.get("name_en") as string,
          name_ar: (formData.get("name_ar") as string) || null,
          emirate_id: emirateId,
          country_id: countryId,
          is_active: formData.get("is_active") === "on",
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
        };
        result = await updateCity(data);
      } else {
        const data = {
          city_code: (formData.get("city_code") as string).toUpperCase(),
          name_en: formData.get("name_en") as string,
          name_ar: (formData.get("name_ar") as string) || null,
          emirate_id: emirateId,
          country_id: countryId,
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
        };
        result = await createCity(data);
      }

      if (result.success) {
        toast.success(`City ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        invalidateCities(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save city");
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
          ? "View City"
          : isEditing
          ? "Edit City"
          : "Add City"
      }
      subtitle={city ? `City: ${city.name_en} (${city.city_code})` : "Create a new city record"}
      recordNumber={city ? city.city_code : undefined}
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
                  <RequiredLabel htmlFor="city_code">City Code</RequiredLabel>
                  <Input
                    id="city_code"
                    name="city_code"
                    required
                    defaultValue={city?.city_code}
                    disabled={isViewing || isEditing}
                    placeholder="ABUDHABI"
                    className="uppercase"
                    maxLength={50}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Unique city identifier (uppercase, alphanumeric with underscores)
                  </span>
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="country_id" className="text-muted-foreground text-xs">
                    Country *
                  </Label>
                  <CountrySelect
                    value={countryId}
                    onValueChange={handleCountryChange}
                    disabled={isViewing}
                    required
                    placeholder="Select country"
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Select country first to filter regions
                  </span>
                </div>

                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="emirate_id">Region / Emirate / Governorate</RequiredLabel>
                  <EmirateSelect
                    value={emirateId}
                    onValueChange={setEmirateId}
                    countryId={countryId}
                    disabled={isViewing || !countryId}
                    required
                    placeholder="Select region / emirate / governorate"
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Administrative region for this city
                  </span>
                </div>

                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="name_en">English Name</RequiredLabel>
                  <Input
                    id="name_en"
                    name="name_en"
                    required
                    defaultValue={city?.name_en}
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
                    defaultValue={city?.name_ar ?? ""}
                    disabled={isViewing}
                    placeholder="أبو ظبي"
                    maxLength={255}
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
                    defaultValue={city?.sort_order ?? 0}
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
                          defaultChecked={city?.is_active ?? true}
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
                        {city?.is_system && (
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 text-xs font-medium">
                            <Shield className="h-3 w-3 mr-1" />
                            System Record
                          </span>
                        )}
                        {city?.is_locked && (
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-destructive/10 text-destructive text-xs font-medium">
                            Locked
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {city?.is_system && (
                  <div className="col-span-12">
                    <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-start gap-2">
                        <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div className="text-xs text-amber-800 dark:text-amber-300">
                          <strong>System City:</strong> This is a protected system city seeded during installation. Exercise caution when modifying.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 3 — Audit Info (Read-only) */}
            <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
              {city ? (
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input value={new Date(city.created_at).toLocaleString()} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input value={new Date(city.updated_at).toLocaleString()} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created By</Label>
                    <Input value={city.created_by?.toString() ?? "—"} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated By</Label>
                    <Input value={city.updated_by?.toString() ?? "—"} disabled className="text-xs" />
                  </div>

                  {city.deactivated_at && (
                    <>
                      <div className="space-y-2 col-span-6">
                        <Label className="text-muted-foreground text-xs">Deactivated At</Label>
                        <Input value={new Date(city.deactivated_at).toLocaleString()} disabled className="text-xs" />
                      </div>

                      <div className="space-y-2 col-span-6">
                        <Label className="text-muted-foreground text-xs">Deactivated By</Label>
                        <Input value={city.deactivated_by?.toString() ?? "—"} disabled className="text-xs" />
                      </div>

                      {city.deactivation_reason && (
                        <div className="space-y-2 col-span-12">
                          <Label className="text-muted-foreground text-xs">Deactivation Reason</Label>
                          <Input value={city.deactivation_reason} disabled className="text-xs" />
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
