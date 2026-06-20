"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { NumberingRule } from "@/features/numbering/numbering-types";
import { createNumberingRule, updateNumberingRule } from "@/server/actions/numbering";
import { RequiredLabel } from "@/components/erp/required-label";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { Binary, FileCode2, Hash, Settings, Shield, ScrollText, Info, Sparkles } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  ERPRecordWorkspaceForm,
  ERPRecordSectionPanel,
} from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type NumberingRuleWorkspaceFormProps = {
  rule?: NumberingRule | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "numbering-rule-workspace-form";

export function NumberingRuleWorkspaceForm({ rule, mode }: NumberingRuleWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [previewPrefix, setPreviewPrefix] = useState(rule?.document_prefix || "EMP");
  const [previewTemplate, setPreviewTemplate] = useState(rule?.format_template || "{DOC}-{SEQ4}");
  const [previewLength, setPreviewLength] = useState(rule?.sequence_length || 4);
  const [previewPadding, setPreviewPadding] = useState(rule?.padding_character || "0");
  const [previewNextSeq] = useState(rule?.next_sequence_number || 1);

  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const sections = [
    { id: "basic", label: "Basic Info", icon: Binary },
    { id: "module", label: "Module & Document", icon: FileCode2 },
    { id: "format", label: "Number Format", icon: Hash },
    { id: "sequence", label: "Sequence Settings", icon: Settings },
    { id: "policy", label: "Generation Policy", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
    { id: "notes", label: "Notes", icon: ScrollText },
  ];

  const generateLivePreview = (): string => {
    try {
      const seq = previewNextSeq.toString().padStart(previewLength, previewPadding);
      let preview = previewTemplate;
      preview = preview.replace("{DOC}", previewPrefix);
      preview = preview.replace("{SEQ}", seq);
      preview = preview.replace("{SEQ3}", previewNextSeq.toString().padStart(3, "0"));
      preview = preview.replace("{SEQ4}", previewNextSeq.toString().padStart(4, "0"));
      preview = preview.replace("{SEQ5}", previewNextSeq.toString().padStart(5, "0"));
      preview = preview.replace("{SEQ6}", previewNextSeq.toString().padStart(6, "0"));
      preview = preview.replace("{SEQ12}", previewNextSeq.toString().padStart(12, "0"));
      return preview;
    } catch { return "Invalid format"; }
  };

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);
    setIsSubmitting(true);
    try {
      const data = {
        rule_code: (formData.get("rule_code") as string).toUpperCase(),
        rule_name: formData.get("rule_name") as string,
        description: (formData.get("description") as string) || null,
        module_code: (formData.get("module_code") as string).toUpperCase(),
        module_name: formData.get("module_name") as string,
        document_type_code: (formData.get("document_type_code") as string).toUpperCase(),
        document_type_name: formData.get("document_type_name") as string,
        document_prefix: (formData.get("document_prefix") as string).toUpperCase(),
        separator: (formData.get("separator") as string) || "-",
        format_template: formData.get("format_template") as string,
        sequence_length: parseInt(formData.get("sequence_length") as string),
        padding_character: (formData.get("padding_character") as string) || "0",
        starting_sequence_number: parseInt(formData.get("starting_sequence_number") as string),
        reset_policy: (formData.get("reset_policy") as "never" | "yearly" | "monthly") || "never",
        reserve_on_draft: formData.get("reserve_on_draft") === "on",
        reserve_on_submit: formData.get("reserve_on_submit") === "on",
        allow_manual_override: formData.get("allow_manual_override") === "on",
        manual_override_requires_permission: formData.get("manual_override_requires_permission") === "on",
        allow_gaps: formData.get("allow_gaps") === "on",
        cancelled_number_policy: (formData.get("cancelled_number_policy") as "never_reuse" | "allow_reuse") || "never_reuse",
        duplicate_prevention_scope: (formData.get("duplicate_prevention_scope") as string) || "document_type",
        is_active: formData.get("is_active") === "on",
        is_locked: formData.get("is_locked") === "on",
        effective_from: (formData.get("effective_from") as string) || null,
        effective_to: (formData.get("effective_to") as string) || null,
        notes: (formData.get("notes") as string) || null,
      };

      const result = isEditing && rule ? await updateNumberingRule({ id: rule.id, ...data }) : await createNumberingRule(data);
      if (result.success) { toast.success(`Numbering rule ${isEditing ? "updated" : "created"} successfully`); clearDraft(); resetDirty(); if (activeTab?.id) markDirty(activeTab.id, false); return true; }
      else { toast.error(result.error ?? "Failed to save numbering rule"); return false; }
    } catch { toast.error("An unexpected error occurred"); return false; }
    finally { setIsSubmitting(false); }
  };

  const handleSaveAndClose = async () => {
    const success = await handleSave();
    if (success) forceCloseActiveTab();
  };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Numbering Rule" : isEditing ? "Edit Numbering Rule" : "New Numbering Rule"}
      subtitle={rule ? `Rule Code: ${rule.rule_code}` : "Define a new auto-numbering rule for document sequences"}
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
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Basic Rule Information">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="rule_code">Rule Code</RequiredLabel>
              <Input id="rule_code" name="rule_code" required defaultValue={getDraftDefault("rule_code", rule?.rule_code ?? "")} disabled={isViewing || isEditing} placeholder="HR_EMPLOYEE" className="uppercase" maxLength={100} />
              <span className="text-[9px] text-muted-foreground">Unique identifier (uppercase, alphanumeric with underscores)</span>
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="rule_name">Rule Name</RequiredLabel>
              <Input id="rule_name" name="rule_name" required defaultValue={getDraftDefault("rule_name", rule?.rule_name ?? "")} disabled={isViewing} placeholder="Employee Number" maxLength={200} />
            </div>
            <div className="space-y-2 col-span-12">
              <Label htmlFor="description" className="text-muted-foreground text-xs">Description</Label>
              <Textarea id="description" name="description" defaultValue={getDraftDefault("description", rule?.description ?? "")} disabled={isViewing} placeholder="Human resources employee reference number" maxLength={500} rows={2} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Status</Label>
              <div className="flex items-center space-x-2">
                <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", rule?.is_active ?? true)} disabled={isViewing} />
                <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
              </div>
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Lock Status</Label>
              <div className="flex items-center space-x-2">
                <Checkbox id="is_locked" name="is_locked" defaultChecked={getDraftBoolean("is_locked", rule?.is_locked ?? false)} disabled={isViewing} />
                <Label htmlFor="is_locked" className="text-sm font-normal cursor-pointer">Locked</Label>
              </div>
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="effective_from" className="text-muted-foreground text-xs">Effective From</Label>
              <Input id="effective_from" name="effective_from" type="date" defaultValue={getDraftDefault("effective_from", rule?.effective_from?.split("T")[0] ?? "")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="effective_to" className="text-muted-foreground text-xs">Effective To</Label>
              <Input id="effective_to" name="effective_to" type="date" defaultValue={getDraftDefault("effective_to", rule?.effective_to?.split("T")[0] ?? "")} disabled={isViewing} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="module" activeId={activeSection} title="Module & Document Type">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="module_code">Module Code</RequiredLabel>
              <Input id="module_code" name="module_code" required defaultValue={getDraftDefault("module_code", rule?.module_code ?? "")} disabled={isViewing} placeholder="HR" className="uppercase" maxLength={50} />
              <span className="text-[9px] text-muted-foreground">e.g., HR, PROCUREMENT, FINANCE</span>
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="module_name">Module Name</RequiredLabel>
              <Input id="module_name" name="module_name" required defaultValue={getDraftDefault("module_name", rule?.module_name ?? "")} disabled={isViewing} placeholder="Human Resources" maxLength={200} />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="document_type_code">Document Type Code</RequiredLabel>
              <Input id="document_type_code" name="document_type_code" required defaultValue={getDraftDefault("document_type_code", rule?.document_type_code ?? "")} disabled={isViewing} placeholder="EMPLOYEE" className="uppercase" maxLength={100} />
              <span className="text-[9px] text-muted-foreground">e.g., EMPLOYEE, PURCHASE_ORDER, INVOICE</span>
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="document_type_name">Document Type Name</RequiredLabel>
              <Input id="document_type_name" name="document_type_name" required defaultValue={getDraftDefault("document_type_name", rule?.document_type_name ?? "")} disabled={isViewing} placeholder="Employee" maxLength={200} />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="document_prefix">Document Prefix</RequiredLabel>
              <Input id="document_prefix" name="document_prefix" required defaultValue={getDraftDefault("document_prefix", rule?.document_prefix ?? "")} disabled={isViewing} placeholder="EMP" className="uppercase font-mono" maxLength={20} onChange={(e) => setPreviewPrefix(e.target.value.toUpperCase())} />
              <span className="text-[9px] text-muted-foreground">Uppercase letters, numbers, underscores only</span>
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="format" activeId={activeSection} title="Number Format">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-4">
              <Label htmlFor="separator" className="text-muted-foreground text-xs">Separator</Label>
              <Input id="separator" name="separator" defaultValue={getDraftDefault("separator", rule?.separator ?? "-")} disabled={isViewing} placeholder="-" maxLength={5} className="font-mono" />
            </div>
            <div className="space-y-2 col-span-8">
              <RequiredLabel htmlFor="format_template">Format Template</RequiredLabel>
              <Input id="format_template" name="format_template" required defaultValue={getDraftDefault("format_template", rule?.format_template ?? "{DOC}-{SEQ4}")} disabled={isViewing} placeholder="{DOC}-{SEQ4}" maxLength={100} className="font-mono" onChange={(e) => setPreviewTemplate(e.target.value)} />
              <div className="text-[9px] text-muted-foreground space-y-1">
                <div className="flex flex-wrap gap-1">
                  {["{DOC}", "{SEQ}", "{SEQ3}", "{SEQ4}", "{SEQ5}", "{SEQ6}", "{YYYY}", "{YY}", "{MM}", "{DD}"].map(t => <Badge key={t} variant="outline" className="text-[9px] font-mono">{t}</Badge>)}
                </div>
                <div className="text-amber-600 dark:text-amber-400">⚠ Do not use: {"{COMPANY}"}, {"{BRANCH}"}, {"{CITY}"}</div>
              </div>
            </div>
            <div className="col-span-12">
              <Card className="bg-indigo-500/5 border-indigo-500/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-indigo-500" />
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Live Preview</div>
                    <div className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">{generateLivePreview()}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="sequence" activeId={activeSection} title="Sequence Settings">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-4">
              <RequiredLabel htmlFor="sequence_length">Sequence Length</RequiredLabel>
              <Input id="sequence_length" name="sequence_length" type="number" required min={1} max={12} defaultValue={getDraftDefault("sequence_length", rule?.sequence_length ?? 4)} disabled={isViewing} onChange={(e) => setPreviewLength(parseInt(e.target.value) || 4)} />
              <span className="text-[9px] text-muted-foreground">Number of digits (1-12)</span>
            </div>
            <div className="space-y-2 col-span-4">
              <Label htmlFor="padding_character" className="text-muted-foreground text-xs">Padding Character</Label>
              <Input id="padding_character" name="padding_character" maxLength={1} defaultValue={getDraftDefault("padding_character", rule?.padding_character ?? "0")} disabled={isViewing} placeholder="0" className="font-mono" onChange={(e) => setPreviewPadding(e.target.value || "0")} />
            </div>
            <div className="space-y-2 col-span-4">
              <RequiredLabel htmlFor="starting_sequence_number">Starting Sequence</RequiredLabel>
              <Input id="starting_sequence_number" name="starting_sequence_number" type="number" required min={1} defaultValue={getDraftDefault("starting_sequence_number", rule?.starting_sequence_number ?? 1)} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-4">
              <Label htmlFor="reset_policy" className="text-muted-foreground text-xs">Reset Policy</Label>
              <Select name="reset_policy" defaultValue={getDraftDefault("reset_policy", rule?.reset_policy ?? "never")} disabled={isViewing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never (Continuous)</SelectItem>
                  <SelectItem value="yearly">Yearly (Future Enhancement)</SelectItem>
                  <SelectItem value="monthly">Monthly (Future Enhancement)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(isViewing || isEditing) && rule && (
              <>
                <div className="space-y-2 col-span-6">
                  <Label className="text-muted-foreground text-xs">Current Sequence</Label>
                  <Input value={rule.current_sequence_number ?? 0} disabled className="font-mono font-bold" />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label className="text-muted-foreground text-xs">Next Sequence</Label>
                  <Input value={rule.next_sequence_number ?? 1} disabled className="font-mono font-bold" />
                </div>
              </>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="policy" activeId={activeSection} title="Generation Policy">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 space-y-3">
              {[
                { id: "reserve_on_draft", label: "Reserve On Draft", checked: rule?.reserve_on_draft ?? false },
                { id: "reserve_on_submit", label: "Reserve On Submit", checked: rule?.reserve_on_submit ?? true },
                { id: "allow_manual_override", label: "Allow Manual Override", checked: rule?.allow_manual_override ?? false },
                { id: "manual_override_requires_permission", label: "Manual Override Requires Permission", checked: rule?.manual_override_requires_permission ?? true },
                { id: "allow_gaps", label: "Allow Gaps in Sequence", checked: rule?.allow_gaps ?? true },
              ].map(({ id, label, checked }) => (
                <div key={id} className="flex items-center space-x-2">
                  <Checkbox id={id} name={id} defaultChecked={getDraftBoolean(id, checked)} disabled={isViewing} />
                  <Label htmlFor={id} className="text-sm font-normal cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="cancelled_number_policy" className="text-muted-foreground text-xs">Cancelled Number Policy</Label>
              <Select name="cancelled_number_policy" defaultValue={getDraftDefault("cancelled_number_policy", rule?.cancelled_number_policy ?? "never_reuse")} disabled={isViewing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never_reuse">Never Reuse</SelectItem>
                  <SelectItem value="allow_reuse">Allow Reuse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="duplicate_prevention_scope" className="text-muted-foreground text-xs">Duplicate Prevention Scope</Label>
              <Input id="duplicate_prevention_scope" name="duplicate_prevention_scope" defaultValue={getDraftDefault("duplicate_prevention_scope", rule?.duplicate_prevention_scope ?? "document_type")} disabled={isViewing} maxLength={100} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {rule ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(rule.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(rule.updated_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created By</Label>
                <Input value={rule.created_by ?? "—"} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated By</Label>
                <Input value={rule.updated_by ?? "—"} disabled className="text-xs" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Audit information will be available after saving</p>
          )}
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="notes" activeId={activeSection} title="Internal Notes">
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={getDraftDefault("notes", rule?.notes ?? "")} disabled={isViewing} placeholder="Internal notes about this numbering rule..." maxLength={1000} rows={4} />
          </div>
        </ERPRecordSectionPanel>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
