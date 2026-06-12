"use client";

import { useState } from "react";
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
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import { Landmark, Phone, Shield, Info } from "lucide-react";

type BankFormDialogProps = {
  bank?: Bank | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BankFormDialog(props: BankFormDialogProps) {
  if (!props.open) return null;
  return (
    <BankFormDialogInner
      key={`${props.mode}-${props.bank?.id ?? "new"}`}
      {...props}
    />
  );
}

function BankFormDialogInner({ bank, mode, open, onOpenChange }: BankFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [countryId, setCountryId] = useState<number | null>(bank?.country_id ?? null);
  const [bankTypeCode, setBankTypeCode] = useState<string | null>(bank?.bank_type_code ?? null);
  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const queryClient = useQueryClient();
  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  const sections = [
    { id: "basic", label: "Basic Info", icon: Landmark },
    { id: "contact", label: "Contact", icon: Phone },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    
    if (isViewing) return;

    const form = document.getElementById("drawer-form") as HTMLFormElement;
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
        resetDirty();
        invalidateBanks(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save bank");
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
      title={isViewing ? "View Bank" : isEditing ? "Edit Bank" : "Add Bank"}
      subtitle={bank ? `Bank: ${bank.bank_name_en} (${bank.bank_code})` : "Create a new bank record"}
      recordNumber={bank?.bank_code}
      mode={isViewing ? "view" : isEditing ? "edit" : "add"}
      isDirty={isDirty}
    >
      <form id="drawer-form" onSubmit={handleSubmit} className="flex flex-1 overflow-hidden h-full">
        <ERPDrawerSectionNav sections={sections} activeSection={activeSection} setActiveSection={setActiveSection} />
        <div className="flex-grow flex flex-col justify-between overflow-hidden">
          <ERPDrawerBody>
            <ERPDrawerSection id="basic" activeId={activeSection} title="Basic Information">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="bank_code">Bank Code</RequiredLabel>
                  <Input id="bank_code" name="bank_code" required defaultValue={bank?.bank_code} disabled={isViewing || isEditing} className="uppercase" placeholder="ENBD" />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="short_name" className="text-muted-foreground text-xs">Short Name</Label>
                  <Input id="short_name" name="short_name" defaultValue={bank?.short_name ?? ""} disabled={isViewing} />
                </div>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="bank_name_en">English Name</RequiredLabel>
                  <Input id="bank_name_en" name="bank_name_en" required defaultValue={bank?.bank_name_en} disabled={isViewing} />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="bank_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
                  <Input id="bank_name_ar" name="bank_name_ar" defaultValue={bank?.bank_name_ar ?? ""} disabled={isViewing} dir="rtl" />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label className="text-muted-foreground text-xs">Country</Label>
                  <CountrySelect value={countryId} onValueChange={setCountryId} disabled={isViewing} allowClear showCode />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label className="text-muted-foreground text-xs">Bank Type</Label>
                  <LookupSelect
                    categoryCode="BANK_TYPES"
                    value={bankTypeCode}
                    onValueChange={(v) => setBankTypeCode(v ? String(v) : null)}
                    valueField="code"
                    showCode
                    disabled={isViewing}
                    allowClear
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="swift_code" className="text-muted-foreground text-xs">SWIFT Code</Label>
                  <Input id="swift_code" name="swift_code" defaultValue={bank?.swift_code ?? ""} disabled={isViewing} className="uppercase" />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="contact" activeId={activeSection} title="Contact & Website">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="contact_phone" className="text-muted-foreground text-xs">Contact Phone</Label>
                  <Input id="contact_phone" name="contact_phone" defaultValue={bank?.contact_phone ?? ""} disabled={isViewing} />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="contact_email" className="text-muted-foreground text-xs">Contact Email</Label>
                  <Input id="contact_email" name="contact_email" type="email" defaultValue={bank?.contact_email ?? ""} disabled={isViewing} />
                </div>
                <div className="space-y-2 col-span-12">
                  <Label htmlFor="website_url" className="text-muted-foreground text-xs">Website</Label>
                  <Input id="website_url" name="website_url" type="url" defaultValue={bank?.website_url ?? ""} disabled={isViewing} placeholder="https://" />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
                  <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={bank?.sort_order ?? 0} disabled={isViewing} />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="status" activeId={activeSection} title="Status">
              <ERPFieldGrid>
                {(isEditing || isViewing) && (
                  <div className="space-y-2 col-span-6">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="is_active" name="is_active" defaultChecked={bank?.is_active ?? true} disabled={isViewing} />
                      <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                    </div>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
              {bank ? (
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input value={new Date(bank.created_at).toLocaleString()} disabled className="text-xs" />
                  </div>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input value={new Date(bank.updated_at).toLocaleString()} disabled className="text-xs" />
                  </div>
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
