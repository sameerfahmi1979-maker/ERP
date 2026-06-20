"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileCheck, ScrollText } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { RequiredLabel } from "@/components/erp/required-label";
import type { DmsRequiredDocumentRuleRow } from "@/server/actions/common-master-data/dms-required-document-rules";
import { createDmsRequiredDocumentRule, updateDmsRequiredDocumentRule } from "@/server/actions/common-master-data/dms-required-document-rules";

type Props = {
  rule?: DmsRequiredDocumentRuleRow | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
  documentTypes?: { id: number; type_code: string; name_en: string }[];
  companies?: { id: number; legal_name_en: string }[];
};

const FORM_ID = "dms-req-doc-rule-form";
const ENTITY_TYPES = ['company','branch','site','employee','vehicle','project','department','party','equipment','contract'];

export function DmsRequiredDocumentRuleForm({ rule, mode, documentTypes = [], companies = [] }: Props) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const disabled = isViewing;

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  useEffect(() => { if (activeTab?.id) markDirty(activeTab.id, isDirty); }, [isDirty, activeTab?.id, markDirty]);
  const { getDraftDefault, syncDraft, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const sections = [
    { id: "basic", label: "Rule Info", icon: FileCheck },
    { id: "notes", label: "Notes", icon: ScrollText },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    setIsSubmitting(true);
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const fd = new FormData(form);
    const data = {
      rule_code: fd.get("rule_code") as string,
      rule_name: fd.get("rule_name") as string,
      entity_type: fd.get("entity_type") as string,
      entity_subtype: (fd.get("entity_subtype") as string) || null,
      document_type_id: fd.get("document_type_id") ? parseInt(fd.get("document_type_id") as string) : null,
      is_required: fd.get("is_required") !== "off",
      requires_expiry_date: fd.get("requires_expiry_date") === "on",
      requires_issue_date: fd.get("requires_issue_date") === "on",
      blocks_activation: fd.get("blocks_activation") === "on",
      owner_company_id: fd.get("owner_company_id") ? parseInt(fd.get("owner_company_id") as string) : null,
      effective_from: (fd.get("effective_from") as string) || null,
      effective_to: (fd.get("effective_to") as string) || null,
      is_active: fd.get("is_active") !== "off",
      notes: (fd.get("notes") as string) || null,
    };
    try {
      const result = isEditing && rule
        ? await updateDmsRequiredDocumentRule({ ...data, id: rule.id })
        : await createDmsRequiredDocumentRule(data);
      if (result.success) { toast.success(isEditing ? "Rule updated" : "Rule created"); clearDraft(); resetDirty(); if (activeTab?.id) markDirty(activeTab.id, false); return true; }
      toast.error(result.error ?? "Failed to save"); return false;
    } catch { toast.error("An unexpected error occurred"); return false; }
    finally { setIsSubmitting(false); }
  };

  const handleSaveAndClose = async () => { const ok = await handleSave(); if (ok) forceCloseActiveTab(); };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Required Document Rule" : isEditing ? "Edit Rule" : "New Required Document Rule"}
      subtitle={rule ? `${rule.rule_name} (${rule.rule_code})` : "Define a new document compliance rule"}
      recordCode={rule?.rule_code}
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
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Rule Details">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="rule_code">Rule Code</RequiredLabel>
              <Input id="rule_code" name="rule_code" className="uppercase" defaultValue={getDraftDefault("rule_code", rule?.rule_code ?? "")} disabled={disabled || isEditing} required placeholder="e.g., COMP-TRADE-LICENSE" />
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="rule_name">Rule Name</RequiredLabel>
              <Input id="rule_name" name="rule_name" defaultValue={getDraftDefault("rule_name", rule?.rule_name ?? "")} disabled={disabled} required />
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="entity_type">Entity Type</RequiredLabel>
              <select id="entity_type" name="entity_type" defaultValue={getDraftDefault("entity_type", rule?.entity_type ?? "")} disabled={disabled} required className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">Select entity type...</option>
                {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="entity_subtype" className="text-muted-foreground text-xs">Entity Subtype</Label>
              <Input id="entity_subtype" name="entity_subtype" defaultValue={getDraftDefault("entity_subtype", rule?.entity_subtype ?? "")} disabled={disabled} placeholder="Optional subtype filter" />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="document_type_id" className="text-muted-foreground text-xs">Document Type</Label>
              <select id="document_type_id" name="document_type_id" defaultValue={getDraftDefault("document_type_id", rule?.document_type_id ?? "")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">Select document type...</option>
                {documentTypes.map(dt => <option key={dt.id} value={dt.id}>{dt.name_en} ({dt.type_code})</option>)}
              </select>
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="owner_company_id" className="text-muted-foreground text-xs">Organization (leave blank for all)</Label>
              <select id="owner_company_id" name="owner_company_id" defaultValue={getDraftDefault("owner_company_id", rule?.owner_company_id ?? "")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">All Organizations</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.legal_name_en}</option>)}
              </select>
            </div>
            <div className="col-span-3 space-y-1.5">
              <Label htmlFor="effective_from" className="text-muted-foreground text-xs">Effective From</Label>
              <Input type="date" id="effective_from" name="effective_from" defaultValue={getDraftDefault("effective_from", rule?.effective_from ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-3 space-y-1.5">
              <Label htmlFor="effective_to" className="text-muted-foreground text-xs">Effective To</Label>
              <Input type="date" id="effective_to" name="effective_to" defaultValue={getDraftDefault("effective_to", rule?.effective_to ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-12 grid grid-cols-3 gap-2 pt-1">
              {[
                { id: "is_required", label: "Is Required", checked: rule?.is_required ?? true },
                { id: "requires_expiry_date", label: "Requires Expiry Date", checked: rule?.requires_expiry_date ?? false },
                { id: "requires_issue_date", label: "Requires Issue Date", checked: rule?.requires_issue_date ?? false },
                { id: "blocks_activation", label: "Blocks Activation (data only — not enforced)", checked: rule?.blocks_activation ?? false },
                { id: "is_active", label: "Active", checked: rule?.is_active ?? true },
              ].map(f => (
                <div key={f.id} className="flex items-center space-x-2">
                  <Checkbox id={f.id} name={f.id} defaultChecked={f.checked} disabled={disabled} />
                  <Label htmlFor={f.id} className="text-xs cursor-pointer">{f.label}</Label>
                </div>
              ))}
            </div>
          </div>
        </ERPRecordSectionPanel>
        <ERPRecordSectionPanel id="notes" activeId={activeSection} title="Notes">
          <Textarea id="notes" name="notes" defaultValue={getDraftDefault("notes", rule?.notes ?? "")} rows={6} disabled={disabled} />
        </ERPRecordSectionPanel>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
