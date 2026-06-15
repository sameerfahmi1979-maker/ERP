"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { Bank } from "@/features/master-data/finance-basics/types";
import { createBank, updateBank } from "@/features/master-data/finance-basics/actions";
import { CountrySelect } from "@/components/erp/geography";
import { LookupSelect } from "@/components/erp/lookup-select";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateBanks } from "@/lib/query/invalidation";
import { Landmark, Phone, Shield, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  ERPRecordWorkspaceForm,
  ERPRecordSectionPanel,
} from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type BankWorkspaceFormProps = {
  bank?: Bank | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "bank-workspace-form";

export function BankWorkspaceForm({ bank, mode }: BankWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty } = useWorkspace();
  const queryClient = useQueryClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");

  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const [countryId, setCountryId] = useState<number | null>(() => {
    const d = getDraftDefault("country_id", "");
    return d ? Number(d) : bank?.country_id ?? null;
  });
  const [bankTypeCode, setBankTypeCode] = useState<string | null>(() =>
    getDraftDefault("bank_type_code", bank?.bank_type_code ?? "") || null
  );

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const sections = [
    { id: "basic", label: "Basic Info", icon: Landmark },
    { id: "contact", label: "Contact", icon: Phone },
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
        bank_name_en: formData.get("bank_name_en") as string,
        bank_name_ar: (formData.get("bank_name_ar") as string) || null,
        short_name: (formData.get("short_name") as string) || null,
        country_id: countryId,
        bank_type_code: bankTypeCode,
        swift_code: (formData.get("swift_code") as string) || null,
        website_url: (formData.get("website_url") as string) || null,
        contact_phone: (formData.get("contact_phone") as string) || null,
        contact_email: (formData.get("contact_email") as string) || null,
        description_en: (formData.get("description_en") as string) || null,
        description_ar: (formData.get("description_ar") as string) || null,
        notes: (formData.get("notes") as string) || null,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
      };
      let result;
      if (isEditing && bank) {
        result = await updateBank({ id: bank.id, ...shared, is_active: formData.get("is_active") === "on" });
      } else {
        result = await createBank({ bank_code: (formData.get("bank_code") as string).toUpperCase(), ...shared });
      }
      if (result.success) {
        toast.success(`Bank ${isEditing ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();
        invalidateBanks(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save bank");
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
      title={isViewing ? "View Bank" : isEditing ? "Edit Bank" : "New Bank"}
      subtitle={bank ? `${bank.bank_name_en} (${bank.bank_code})` : "Create a new bank record"}
      recordCode={bank?.bank_code}
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
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="bank_code">Bank Code</RequiredLabel>
              <Input id="bank_code" name="bank_code" required defaultValue={getDraftDefault("bank_code", bank?.bank_code ?? "")} disabled={isViewing || isEditing} className="uppercase" placeholder="ENBD" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="short_name" className="text-muted-foreground text-xs">Short Name</Label>
              <Input id="short_name" name="short_name" defaultValue={getDraftDefault("short_name", bank?.short_name ?? "")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="bank_name_en">English Name</RequiredLabel>
              <Input id="bank_name_en" name="bank_name_en" required defaultValue={getDraftDefault("bank_name_en", bank?.bank_name_en ?? "")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="bank_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
              <Input id="bank_name_ar" name="bank_name_ar" defaultValue={getDraftDefault("bank_name_ar", bank?.bank_name_ar ?? "")} disabled={isViewing} dir="rtl" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Country</Label>
              <CountrySelect value={countryId} onValueChange={(v) => { setCountryId(v); writeDraftField("country_id", v ?? ""); }} disabled={isViewing} allowClear showCode />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Bank Type</Label>
              <LookupSelect categoryCode="BANK_TYPES" value={bankTypeCode} onValueChange={(v) => { const s = v ? String(v) : null; setBankTypeCode(s); writeDraftField("bank_type_code", s ?? ""); }} valueField="code" showCode disabled={isViewing} allowClear />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="swift_code" className="text-muted-foreground text-xs">SWIFT Code</Label>
              <Input id="swift_code" name="swift_code" defaultValue={getDraftDefault("swift_code", bank?.swift_code ?? "")} disabled={isViewing} className="uppercase" />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="contact" activeId={activeSection} title="Contact & Website">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <Label htmlFor="contact_phone" className="text-muted-foreground text-xs">Contact Phone</Label>
              <Input id="contact_phone" name="contact_phone" defaultValue={getDraftDefault("contact_phone", bank?.contact_phone ?? "")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="contact_email" className="text-muted-foreground text-xs">Contact Email</Label>
              <Input id="contact_email" name="contact_email" type="email" defaultValue={getDraftDefault("contact_email", bank?.contact_email ?? "")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-12">
              <Label htmlFor="website_url" className="text-muted-foreground text-xs">Website</Label>
              <Input id="website_url" name="website_url" type="url" defaultValue={getDraftDefault("website_url", bank?.website_url ?? "")} disabled={isViewing} placeholder="https://" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={getDraftDefault("sort_order", bank?.sort_order ?? 0)} disabled={isViewing} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
          <div className="grid grid-cols-12 gap-4">
            {(isEditing || isViewing) && (
              <div className="space-y-2 col-span-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", bank?.is_active ?? true)} disabled={isViewing} />
                  <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                </div>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {bank ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(bank.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(bank.updated_at).toLocaleString()} disabled className="text-xs" />
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
