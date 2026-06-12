"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { Country } from "@/features/master-data/geography/types";
import { createCountry, updateCountry } from "@/features/master-data/geography/actions";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateCountries } from "@/lib/query/invalidation";
import {
  Globe,
  Phone,
  Tag,
  Shield,
  Info,
} from "lucide-react";

type CountryFormDialogProps = {
  country?: Country | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CountryFormDialog({
  country,
  mode,
  open,
  onOpenChange,
}: CountryFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  // Dirty state tracking for Safe Close
  const queryClient = useQueryClient();
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  const sections = [
    { id: "basic", label: "Basic Info", icon: Globe },
    { id: "contact", label: "Nationality & Contact", icon: Phone },
    { id: "classification", label: "Classification", icon: Tag },
    { id: "status", label: "Status & Governance", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    
    if (isViewing) return;

    setIsSubmitting(true);

    const form = document.getElementById("drawer-form") as HTMLFormElement;
    const formData = new FormData(form);

    try {
      let result;
      if (isEditing && country) {
        const data = {
          id: country.id,
          name_en: formData.get("name_en") as string,
          name_ar: (formData.get("name_ar") as string) || null,
          nationality_en: formData.get("nationality_en") as string,
          nationality_ar: (formData.get("nationality_ar") as string) || null,
          phone_code: (formData.get("phone_code") as string) || null,
          default_currency_code: (formData.get("default_currency_code") as string) || null,
          is_gcc: formData.get("is_gcc") === "on",
          is_uae: formData.get("is_uae") === "on",
          is_active: formData.get("is_active") === "on",
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
        };
        result = await updateCountry(data);
      } else {
        const data = {
          country_code: (formData.get("country_code") as string).toUpperCase(),
          iso3_code: (formData.get("iso3_code") as string).toUpperCase(),
          name_en: formData.get("name_en") as string,
          name_ar: (formData.get("name_ar") as string) || null,
          nationality_en: formData.get("nationality_en") as string,
          nationality_ar: (formData.get("nationality_ar") as string) || null,
          phone_code: (formData.get("phone_code") as string) || null,
          default_currency_code: (formData.get("default_currency_code") as string) || null,
          is_gcc: formData.get("is_gcc") === "on",
          is_uae: formData.get("is_uae") === "on",
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
        };
        result = await createCountry(data);
      }

      if (result.success) {
        toast.success(`Country ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        invalidateCountries(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save country");
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
          ? "View Country"
          : isEditing
          ? "Edit Country"
          : "Add Country"
      }
      subtitle={country ? `Country: ${country.name_en} (${country.country_code})` : "Create a new country record"}
      recordNumber={country ? country.country_code : undefined}
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
                  <RequiredLabel htmlFor="country_code" className="text-muted-foreground text-xs" required>
                    Country Code (ISO2)
                  </RequiredLabel>
                  <Input
                    id="country_code"
                    name="country_code"
                    required
                    defaultValue={country?.country_code}
                    disabled={isViewing || isEditing}
                    placeholder="AE"
                    className="uppercase"
                    maxLength={2}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    2-character ISO 3166-1 alpha-2 code (e.g., AE, SA, US)
                  </span>
                </div>

                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="iso3_code" className="text-muted-foreground text-xs" required>
                    ISO3 Code
                  </RequiredLabel>
                  <Input
                    id="iso3_code"
                    name="iso3_code"
                    required
                    defaultValue={country?.iso3_code}
                    disabled={isViewing || isEditing}
                    placeholder="ARE"
                    className="uppercase"
                    maxLength={3}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    3-character ISO 3166-1 alpha-3 code (e.g., ARE, SAU, USA)
                  </span>
                </div>

                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="name_en" className="text-muted-foreground text-xs" required>
                    English Name
                  </RequiredLabel>
                  <Input
                    id="name_en"
                    name="name_en"
                    required
                    defaultValue={country?.name_en}
                    disabled={isViewing}
                    placeholder="United Arab Emirates"
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
                    defaultValue={country?.name_ar ?? ""}
                    disabled={isViewing}
                    placeholder="الإمارات العربية المتحدة"
                    maxLength={255}
                    dir="rtl"
                  />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 2 — Nationality & Contact */}
            <ERPDrawerSection id="contact" activeId={activeSection} title="Nationality & Contact">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="nationality_en" className="text-muted-foreground text-xs" required>
                    English Nationality
                  </RequiredLabel>
                  <Input
                    id="nationality_en"
                    name="nationality_en"
                    required
                    defaultValue={country?.nationality_en}
                    disabled={isViewing}
                    placeholder="Emirati"
                    maxLength={100}
                  />
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="nationality_ar" className="text-muted-foreground text-xs">
                    Arabic Nationality
                  </Label>
                  <Input
                    id="nationality_ar"
                    name="nationality_ar"
                    defaultValue={country?.nationality_ar ?? ""}
                    disabled={isViewing}
                    placeholder="إماراتي"
                    maxLength={100}
                    dir="rtl"
                  />
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="phone_code" className="text-muted-foreground text-xs">
                    Phone Code
                  </Label>
                  <Input
                    id="phone_code"
                    name="phone_code"
                    defaultValue={country?.phone_code ?? ""}
                    disabled={isViewing}
                    placeholder="+971"
                    maxLength={10}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    International dialing code (e.g., +971, +966, +1)
                  </span>
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="default_currency_code" className="text-muted-foreground text-xs">
                    Default Currency
                  </Label>
                  <Input
                    id="default_currency_code"
                    name="default_currency_code"
                    defaultValue={country?.default_currency_code ?? ""}
                    disabled={isViewing}
                    placeholder="AED"
                    className="uppercase"
                    maxLength={3}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    ISO 4217 currency code (e.g., AED, SAR, USD)
                  </span>
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 3 — Classification */}
            <ERPDrawerSection id="classification" activeId={activeSection} title="Classification">
              <ERPFieldGrid>
                <div className="space-y-3 col-span-12">
                  <Label className="text-muted-foreground text-xs">Country Classifications</Label>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_gcc"
                      name="is_gcc"
                      defaultChecked={country?.is_gcc ?? false}
                      disabled={isViewing}
                    />
                    <Label htmlFor="is_gcc" className="text-sm font-normal cursor-pointer">
                      GCC Country (Gulf Cooperation Council)
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_uae"
                      name="is_uae"
                      defaultChecked={country?.is_uae ?? false}
                      disabled={isViewing}
                    />
                    <Label htmlFor="is_uae" className="text-sm font-normal cursor-pointer">
                      United Arab Emirates
                    </Label>
                  </div>
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
                    defaultValue={country?.sort_order ?? 0}
                    disabled={isViewing}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Lower numbers appear first in dropdowns
                  </span>
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 4 — Status & Governance */}
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
                          defaultChecked={country?.is_active ?? true}
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
                        {country?.is_system && (
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 text-xs font-medium">
                            <Shield className="h-3 w-3 mr-1" />
                            System Record
                          </span>
                        )}
                        {country?.is_locked && (
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-destructive/10 text-destructive text-xs font-medium">
                            Locked
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {country?.is_system && (
                  <div className="col-span-12">
                    <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-start gap-2">
                        <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div className="text-xs text-amber-800 dark:text-amber-300">
                          <strong>System Country:</strong> This is a protected system country seeded during installation. Exercise caution when modifying.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 5 — Audit Info (Read-only) */}
            <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
              {country ? (
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input value={new Date(country.created_at).toLocaleString()} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input value={new Date(country.updated_at).toLocaleString()} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created By</Label>
                    <Input value={country.created_by?.toString() ?? "—"} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated By</Label>
                    <Input value={country.updated_by?.toString() ?? "—"} disabled className="text-xs" />
                  </div>

                  {country.deactivated_at && (
                    <>
                      <div className="space-y-2 col-span-6">
                        <Label className="text-muted-foreground text-xs">Deactivated At</Label>
                        <Input value={new Date(country.deactivated_at).toLocaleString()} disabled className="text-xs" />
                      </div>

                      <div className="space-y-2 col-span-6">
                        <Label className="text-muted-foreground text-xs">Deactivated By</Label>
                        <Input value={country.deactivated_by?.toString() ?? "—"} disabled className="text-xs" />
                      </div>

                      {country.deactivation_reason && (
                        <div className="space-y-2 col-span-12">
                          <Label className="text-muted-foreground text-xs">Deactivation Reason</Label>
                          <Input value={country.deactivation_reason} disabled className="text-xs" />
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
            onCancel={() => onOpenChange(false)}
            onSave={isViewing ? undefined : () => handleSave()}
            onSaveAndClose={isViewing ? undefined : () => handleSaveAndClose()}
            isSubmitting={isSubmitting}
            formId="drawer-form"
            hasUnsavedChanges={isDirty}
          />
        </div>
      </form>
    </ERPDrawerForm>
  );
}
