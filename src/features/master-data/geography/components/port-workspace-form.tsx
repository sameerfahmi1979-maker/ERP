"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { PortWithRelations } from "@/features/master-data/geography/types";
import { createPort, updatePort } from "@/features/master-data/geography/actions";
import { EmirateSelect, CountrySelect } from "@/components/erp/geography";
import { LookupSelect } from "@/components/erp/lookup-select";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidatePorts } from "@/lib/query/invalidation";
import { Anchor, Tag, Shield, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type PortWorkspaceFormProps = {
  port?: PortWithRelations | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "port-workspace-form";

export function PortWorkspaceForm({ port, mode }: PortWorkspaceFormProps) {
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
    return d ? Number(d) : port?.country_id ?? null;
  });
  const [emirateId, setEmirateId] = useState<number | null>(() => {
    const d = getDraftDefault("emirate_id", "");
    return d ? Number(d) : port?.emirate_id ?? null;
  });
  const [portTypeCode, setPortTypeCode] = useState<string | null>(() =>
    getDraftDefault("port_type_code", port?.port_type_code ?? "") || null
  );

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const handleCountryChange = useCallback((newCountryId: number | null) => {
    setCountryId(newCountryId);
    writeDraftField("country_id", newCountryId ?? "");
    setEmirateId(null);
    writeDraftField("emirate_id", "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeDraftField]);

  const sections = [
    { id: "basic", label: "Basic Info", icon: Anchor },
    { id: "details", label: "Port Details", icon: Tag },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    if (!emirateId) { toast.error("Please select a Region / Emirate / Governorate"); return false; }
    if (!portTypeCode) { toast.error("Please select a port type"); return false; }
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);
    setIsSubmitting(true);
    try {
      const shared = {
        name_en: formData.get("name_en") as string,
        name_ar: (formData.get("name_ar") as string) || null,
        emirate_id: emirateId,
        country_id: countryId,
        port_type_code: portTypeCode,
        icao_code: (formData.get("icao_code") as string) || null,
        iata_code: (formData.get("iata_code") as string) || null,
        operator_name: (formData.get("operator_name") as string) || null,
        website: (formData.get("website") as string) || null,
        description: (formData.get("description") as string) || null,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
      };
      let result;
      if (isEditing && port) {
        result = await updatePort({ id: port.id, ...shared, is_active: formData.get("is_active") === "on" });
      } else {
        result = await createPort({ port_code: (formData.get("port_code") as string).toUpperCase(), ...shared });
      }
      if (result.success) {
        toast.success(`Port ${isEditing ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();
        invalidatePorts(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save port");
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
      title={isViewing ? "View Port" : isEditing ? "Edit Port" : "New Port"}
      subtitle={port ? `${port.name_en} (${port.port_code})` : "Create a new port record"}
      recordCode={port?.port_code}
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
              <Label className="text-muted-foreground text-xs">Country</Label>
              <CountrySelect value={countryId} onValueChange={handleCountryChange} disabled={isViewing || isEditing} placeholder="Select country" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Region / Emirate *</Label>
              <EmirateSelect value={emirateId} onValueChange={(v) => { setEmirateId(v); writeDraftField("emirate_id", v ?? ""); }} countryId={countryId ?? undefined} disabled={isViewing || isEditing} required placeholder="Select region" />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="port_code">Port Code</RequiredLabel>
              <Input id="port_code" name="port_code" required defaultValue={getDraftDefault("port_code", port?.port_code ?? "")} disabled={isViewing || isEditing} className="uppercase" placeholder="DXB" maxLength={10} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Port Type *</Label>
              <LookupSelect categoryCode="PORT_TYPES" value={portTypeCode} onValueChange={(v) => { const s = v ? String(v) : null; setPortTypeCode(s); writeDraftField("port_type_code", s ?? ""); }} disabled={isViewing} required placeholder="Select port type" />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="name_en">English Name</RequiredLabel>
              <Input id="name_en" name="name_en" required defaultValue={getDraftDefault("name_en", port?.name_en ?? "")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
              <Input id="name_ar" name="name_ar" defaultValue={getDraftDefault("name_ar", port?.name_ar ?? "")} disabled={isViewing} dir="rtl" />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="details" activeId={activeSection} title="Port Details">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <Label htmlFor="iata_code" className="text-muted-foreground text-xs">IATA Code</Label>
              <Input id="iata_code" name="iata_code" defaultValue={getDraftDefault("iata_code", port?.iata_code ?? "")} disabled={isViewing} className="uppercase" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="icao_code" className="text-muted-foreground text-xs">ICAO Code</Label>
              <Input id="icao_code" name="icao_code" defaultValue={getDraftDefault("icao_code", port?.icao_code ?? "")} disabled={isViewing} className="uppercase" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={getDraftDefault("sort_order", port?.sort_order ?? 0)} disabled={isViewing} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
          <div className="grid grid-cols-12 gap-4">
            {(isEditing || isViewing) && (
              <div className="space-y-3 col-span-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", port?.is_active ?? true)} disabled={isViewing} />
                  <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                </div>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {port ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(port.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(port.updated_at).toLocaleString()} disabled className="text-xs" />
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
