"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { Country } from "@/features/master-data/geography/types";
import { createCountry, updateCountry } from "@/features/master-data/geography/actions";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateCountries } from "@/lib/query/invalidation";
import { Globe, Phone, Tag, Shield, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type CountryWorkspaceFormProps = {
  country?: Country | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "country-workspace-form";

export function CountryWorkspaceForm({ country, mode }: CountryWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty } = useWorkspace();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");

  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const sections = [
    { id: "basic", label: "Basic Info", icon: Globe },
    { id: "contact", label: "Nationality & Contact", icon: Phone },
    { id: "classification", label: "Classification", icon: Tag },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);
    setIsSubmitting(true);
    try {
      const shared = {
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
      let result;
      if (isEditing && country) {
        result = await updateCountry({ id: country.id, ...shared, is_active: formData.get("is_active") === "on" });
      } else {
        result = await createCountry({
          country_code: (formData.get("country_code") as string).toUpperCase(),
          iso3_code: (formData.get("iso3_code") as string).toUpperCase(),
          ...shared,
        });
      }
      if (result.success) {
        toast.success(`Country ${isEditing ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();
        invalidateCountries(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save country");
        return false;
      }
    } catch {
      toast.error("An unexpected error occurred");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndClose = async () => {
    const success = await handleSave();
    if (success) handleRequestClose();
  };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Country" : isEditing ? "Edit Country" : "New Country"}
      subtitle={country ? `${country.name_en} (${country.country_code})` : "Create a new country record"}
      recordCode={country?.country_code}
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={isDirty}
      onSave={isViewing ? undefined : handleSave}
      onSaveAndClose={isViewing ? undefined : handleSaveAndClose}
      onRequestClose={handleRequestClose}
      isSubmitting={isSubmitting}
    >
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); handleSaveAndClose(); }} onInput={syncDraft} onChange={syncDraft}>
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Basic Information">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-4">
              <RequiredLabel htmlFor="country_code">ISO2 Code</RequiredLabel>
              <Input id="country_code" name="country_code" required defaultValue={getDraftDefault("country_code", country?.country_code ?? "")} disabled={isViewing || isEditing} className="uppercase" placeholder="AE" maxLength={2} />
            </div>
            <div className="space-y-2 col-span-4">
              <RequiredLabel htmlFor="iso3_code">ISO3 Code</RequiredLabel>
              <Input id="iso3_code" name="iso3_code" required defaultValue={getDraftDefault("iso3_code", country?.iso3_code ?? "")} disabled={isViewing || isEditing} className="uppercase" placeholder="ARE" maxLength={3} />
            </div>
            <div className="space-y-2 col-span-4">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={getDraftDefault("sort_order", country?.sort_order ?? 0)} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="name_en">English Name</RequiredLabel>
              <Input id="name_en" name="name_en" required defaultValue={getDraftDefault("name_en", country?.name_en ?? "")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
              <Input id="name_ar" name="name_ar" defaultValue={getDraftDefault("name_ar", country?.name_ar ?? "")} disabled={isViewing} dir="rtl" />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="contact" activeId={activeSection} title="Nationality & Contact">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="nationality_en">Nationality (EN)</RequiredLabel>
              <Input id="nationality_en" name="nationality_en" required defaultValue={getDraftDefault("nationality_en", country?.nationality_en ?? "")} disabled={isViewing} placeholder="Emirati" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="nationality_ar" className="text-muted-foreground text-xs">Nationality (AR)</Label>
              <Input id="nationality_ar" name="nationality_ar" defaultValue={getDraftDefault("nationality_ar", country?.nationality_ar ?? "")} disabled={isViewing} dir="rtl" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="phone_code" className="text-muted-foreground text-xs">Phone Code</Label>
              <Input id="phone_code" name="phone_code" defaultValue={getDraftDefault("phone_code", country?.phone_code ?? "")} disabled={isViewing} placeholder="+971" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="default_currency_code" className="text-muted-foreground text-xs">Default Currency Code</Label>
              <Input id="default_currency_code" name="default_currency_code" defaultValue={getDraftDefault("default_currency_code", country?.default_currency_code ?? "")} disabled={isViewing} placeholder="AED" className="uppercase" />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="classification" activeId={activeSection} title="Classification">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-3 col-span-6">
              <div className="flex items-center space-x-2">
                <Checkbox id="is_gcc" name="is_gcc" defaultChecked={getDraftBoolean("is_gcc", country?.is_gcc ?? false)} disabled={isViewing} />
                <Label htmlFor="is_gcc" className="text-sm font-normal cursor-pointer">GCC Country</Label>
              </div>
            </div>
            <div className="space-y-3 col-span-6">
              <div className="flex items-center space-x-2">
                <Checkbox id="is_uae" name="is_uae" defaultChecked={getDraftBoolean("is_uae", country?.is_uae ?? false)} disabled={isViewing} />
                <Label htmlFor="is_uae" className="text-sm font-normal cursor-pointer">UAE</Label>
              </div>
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
          <div className="grid grid-cols-12 gap-4">
            {(isEditing || isViewing) && (
              <div className="space-y-3 col-span-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", country?.is_active ?? true)} disabled={isViewing} />
                  <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                </div>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {country ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(country.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(country.updated_at).toLocaleString()} disabled className="text-xs" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Audit information will be available after saving</p>
          )}
        </ERPRecordSectionPanel>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
