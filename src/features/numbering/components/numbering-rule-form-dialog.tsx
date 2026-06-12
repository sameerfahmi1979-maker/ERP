"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import { RequiredLabel } from "@/components/erp/required-label";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { Label } from "@/components/ui/label";
import {
  Binary,
  FileCode2,
  Hash,
  Settings,
  Shield,
  ScrollText,
  Info,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type NumberingRuleFormDialogProps = {
  rule?: NumberingRule | null;
  mode: "add" | "edit" | "view" | "duplicate";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NumberingRuleFormDialog({
  rule,
  mode,
  open,
  onOpenChange,
}: NumberingRuleFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const isDuplicating = mode === "duplicate";

  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  // Live preview state
  const [previewPrefix, setPreviewPrefix] = useState(rule?.document_prefix || "EMP");
  const [previewTemplate, setPreviewTemplate] = useState(rule?.format_template || "{DOC}-{SEQ4}");
  const [previewLength, setPreviewLength] = useState(rule?.sequence_length || 4);
  const [previewPadding, setPreviewPadding] = useState(rule?.padding_character || "0");
  const [previewNextSeq, setPreviewNextSeq] = useState(rule?.next_sequence_number || 1);

  // Reset preview when rule changes
  useEffect(() => {
    if (rule && (isEditing || isViewing)) {
      setPreviewPrefix(rule.document_prefix);
      setPreviewTemplate(rule.format_template);
      setPreviewLength(rule.sequence_length);
      setPreviewPadding(rule.padding_character);
      setPreviewNextSeq(rule.next_sequence_number);
    } else if (!rule) {
      setPreviewPrefix("EMP");
      setPreviewTemplate("{DOC}-{SEQ4}");
      setPreviewLength(4);
      setPreviewPadding("0");
      setPreviewNextSeq(1);
    }
  }, [rule, isEditing, isViewing]);

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
    } catch {
      return "Invalid format";
    }
  };

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);

    const form = document.getElementById("drawer-form") as HTMLFormElement;
    const formData = new FormData(form);

    // Build data object
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

    try {
      let result;
      if (isEditing && rule) {
        result = await updateNumberingRule({ id: rule.id, ...data });
      } else {
        result = await createNumberingRule(data);
      }

      if (result.success) {
        toast.success(`Numbering rule ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        return true;
      } else {
        toast.error(result.error ?? "Failed to save numbering rule");
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
    // Default form submission is "Save & Close"
    await handleSaveAndClose();
  };

  return (
    <ERPDrawerForm
      open={open}
      onOpenChange={onOpenChange}
      title={
        isViewing
          ? "View Numbering Rule"
          : isEditing
          ? "Edit Numbering Rule"
          : isDuplicating
          ? "Duplicate Numbering Rule"
          : "Add Numbering Rule"
      }
      subtitle={rule && !isDuplicating ? `Rule Code: ${rule.rule_code}` : "Create a new numbering rule"}
      recordNumber={rule && !isDuplicating ? rule.rule_code : undefined}
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
          {/* Section 1 — Basic Rule Information */}
          <ERPDrawerSection id="basic" activeId={activeSection} title="Basic Rule Information">
            <ERPFieldGrid>
              <div className="space-y-2 col-span-6">
                <RequiredLabel htmlFor="rule_code" className="text-muted-foreground text-xs" required>
                  Rule Code
                </RequiredLabel>
                <Input
                  id="rule_code"
                  name="rule_code"
                  required
                  defaultValue={isDuplicating ? "" : rule?.rule_code}
                  disabled={isViewing || isEditing}
                  placeholder="HR_EMPLOYEE"
                  className="uppercase"
                  maxLength={100}
                />
                <span className="text-[9px] text-muted-foreground">
                  Unique identifier (uppercase, alphanumeric with underscores)
                </span>
              </div>

              <div className="space-y-2 col-span-6">
                <RequiredLabel htmlFor="rule_name" className="text-muted-foreground text-xs" required>
                  Rule Name
                </RequiredLabel>
                <Input
                  id="rule_name"
                  name="rule_name"
                  required
                  defaultValue={rule?.rule_name}
                  disabled={isViewing}
                  placeholder="Employee Number"
                  maxLength={200}
                />
              </div>

              <div className="space-y-2 col-span-12">
                <Label htmlFor="description" className="text-muted-foreground text-xs">
                  Description
                </Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={rule?.description ?? ""}
                  disabled={isViewing}
                  placeholder="Human resources employee reference number"
                  maxLength={500}
                  rows={2}
                />
              </div>

              <div className="space-y-2 col-span-6">
                <Label htmlFor="is_active" className="text-muted-foreground text-xs">
                  Status
                </Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_active"
                    name="is_active"
                    defaultChecked={rule?.is_active ?? true}
                    disabled={isViewing}
                  />
                  <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">
                    Active
                  </Label>
                </div>
              </div>

              <div className="space-y-2 col-span-6">
                <Label htmlFor="is_locked" className="text-muted-foreground text-xs">
                  Lock Status
                </Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_locked"
                    name="is_locked"
                    defaultChecked={rule?.is_locked ?? false}
                    disabled={isViewing}
                  />
                  <Label htmlFor="is_locked" className="text-sm font-normal cursor-pointer">
                    Locked
                  </Label>
                </div>
              </div>

              <div className="space-y-2 col-span-6">
                <Label htmlFor="effective_from" className="text-muted-foreground text-xs">
                  Effective From
                </Label>
                <Input
                  id="effective_from"
                  name="effective_from"
                  type="date"
                  defaultValue={rule?.effective_from?.split("T")[0] ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="space-y-2 col-span-6">
                <Label htmlFor="effective_to" className="text-muted-foreground text-xs">
                  Effective To
                </Label>
                <Input
                  id="effective_to"
                  name="effective_to"
                  type="date"
                  defaultValue={rule?.effective_to?.split("T")[0] ?? ""}
                  disabled={isViewing}
                />
              </div>
            </ERPFieldGrid>
          </ERPDrawerSection>

          {/* Section 2 — Module and Document Type */}
          <ERPDrawerSection id="module" activeId={activeSection} title="Module & Document Type">
            <ERPFieldGrid>
              <div className="space-y-2 col-span-6">
                <RequiredLabel htmlFor="module_code" className="text-muted-foreground text-xs" required>
                  Module Code
                </RequiredLabel>
                <Input
                  id="module_code"
                  name="module_code"
                  required
                  defaultValue={rule?.module_code}
                  disabled={isViewing}
                  placeholder="HR"
                  className="uppercase"
                  maxLength={50}
                />
                <span className="text-[9px] text-muted-foreground">e.g., HR, PROCUREMENT, FINANCE</span>
              </div>

              <div className="space-y-2 col-span-6">
                <RequiredLabel htmlFor="module_name" className="text-muted-foreground text-xs" required>
                  Module Name
                </RequiredLabel>
                <Input
                  id="module_name"
                  name="module_name"
                  required
                  defaultValue={rule?.module_name}
                  disabled={isViewing}
                  placeholder="Human Resources"
                  maxLength={200}
                />
              </div>

              <div className="space-y-2 col-span-6">
                <RequiredLabel htmlFor="document_type_code" className="text-muted-foreground text-xs" required>
                  Document Type Code
                </RequiredLabel>
                <Input
                  id="document_type_code"
                  name="document_type_code"
                  required
                  defaultValue={rule?.document_type_code}
                  disabled={isViewing}
                  placeholder="EMPLOYEE"
                  className="uppercase"
                  maxLength={100}
                />
                <span className="text-[9px] text-muted-foreground">e.g., EMPLOYEE, PURCHASE_ORDER, INVOICE</span>
              </div>

              <div className="space-y-2 col-span-6">
                <RequiredLabel htmlFor="document_type_name" className="text-muted-foreground text-xs" required>
                  Document Type Name
                </RequiredLabel>
                <Input
                  id="document_type_name"
                  name="document_type_name"
                  required
                  defaultValue={rule?.document_type_name}
                  disabled={isViewing}
                  placeholder="Employee"
                  maxLength={200}
                />
              </div>

              <div className="space-y-2 col-span-6">
                <RequiredLabel htmlFor="document_prefix" className="text-muted-foreground text-xs" required>
                  Document Prefix
                </RequiredLabel>
                <Input
                  id="document_prefix"
                  name="document_prefix"
                  required
                  defaultValue={rule?.document_prefix}
                  disabled={isViewing}
                  placeholder="EMP"
                  className="uppercase font-mono"
                  maxLength={20}
                  onChange={(e) => setPreviewPrefix(e.target.value.toUpperCase())}
                />
                <span className="text-[9px] text-muted-foreground">Uppercase letters, numbers, underscores only</span>
              </div>
            </ERPFieldGrid>
          </ERPDrawerSection>

          {/* Section 3 — Number Format */}
          <ERPDrawerSection id="format" activeId={activeSection} title="Number Format">
            <ERPFieldGrid>
              <div className="space-y-2 col-span-4">
                <Label htmlFor="separator" className="text-muted-foreground text-xs">
                  Separator
                </Label>
                <Input
                  id="separator"
                  name="separator"
                  defaultValue={rule?.separator ?? "-"}
                  disabled={isViewing}
                  placeholder="-"
                  maxLength={5}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2 col-span-8">
                <RequiredLabel htmlFor="format_template" className="text-muted-foreground text-xs" required>
                  Format Template
                </RequiredLabel>
                <Input
                  id="format_template"
                  name="format_template"
                  required
                  defaultValue={rule?.format_template ?? "{DOC}-{SEQ4}"}
                  disabled={isViewing}
                  placeholder="{DOC}-{SEQ4}"
                  maxLength={100}
                  className="font-mono"
                  onChange={(e) => setPreviewTemplate(e.target.value)}
                />
                <div className="text-[9px] text-muted-foreground space-y-1">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[9px] font-mono">
                      {"{DOC}"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] font-mono">
                      {"{SEQ}"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] font-mono">
                      {"{SEQ3}"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] font-mono">
                      {"{SEQ4}"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] font-mono">
                      {"{SEQ5}"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] font-mono">
                      {"{SEQ6}"}
                    </Badge>
                  </div>
                  <div className="text-amber-600 dark:text-amber-400">
                    ⚠ Do not use: {"{COMPANY}"}, {"{BRANCH}"}, {"{CITY}"}, {"{YYYY}"}, {"{MM}"}
                  </div>
                </div>
              </div>

              {/* Live Preview Card */}
              <div className="col-span-12">
                <Card className="bg-indigo-500/5 border-indigo-500/20">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-5 w-5 text-indigo-500" />
                      <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          Live Preview
                        </div>
                        <div className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                          {generateLivePreview()}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ERPFieldGrid>
          </ERPDrawerSection>

          {/* Section 4 — Sequence Settings */}
          <ERPDrawerSection id="sequence" activeId={activeSection} title="Sequence Settings">
            <ERPFieldGrid>
              <div className="space-y-2 col-span-4">
                <RequiredLabel htmlFor="sequence_length" className="text-muted-foreground text-xs" required>
                  Sequence Length
                </RequiredLabel>
                <Input
                  id="sequence_length"
                  name="sequence_length"
                  type="number"
                  required
                  min={1}
                  max={12}
                  defaultValue={rule?.sequence_length ?? 4}
                  disabled={isViewing}
                  onChange={(e) => setPreviewLength(parseInt(e.target.value) || 4)}
                />
                <span className="text-[9px] text-muted-foreground">Number of digits (1-12)</span>
              </div>

              <div className="space-y-2 col-span-4">
                <Label htmlFor="padding_character" className="text-muted-foreground text-xs">
                  Padding Character
                </Label>
                <Input
                  id="padding_character"
                  name="padding_character"
                  maxLength={1}
                  defaultValue={rule?.padding_character ?? "0"}
                  disabled={isViewing}
                  placeholder="0"
                  className="font-mono"
                  onChange={(e) => setPreviewPadding(e.target.value || "0")}
                />
              </div>

              <div className="space-y-2 col-span-4">
                <RequiredLabel htmlFor="starting_sequence_number" className="text-muted-foreground text-xs" required>
                  Starting Sequence
                </RequiredLabel>
                <Input
                  id="starting_sequence_number"
                  name="starting_sequence_number"
                  type="number"
                  required
                  min={1}
                  defaultValue={rule?.starting_sequence_number ?? 1}
                  disabled={isViewing}
                />
              </div>

              <div className="space-y-2 col-span-4">
                <Label htmlFor="reset_policy" className="text-muted-foreground text-xs">
                  Reset Policy
                </Label>
                <Select name="reset_policy" defaultValue={rule?.reset_policy ?? "never"} disabled={isViewing}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Never (Continuous)</SelectItem>
                    <SelectItem value="yearly">Yearly (Future Enhancement)</SelectItem>
                    <SelectItem value="monthly">Monthly (Future Enhancement)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isViewing || isEditing ? (
                <>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Current Sequence</Label>
                    <Input
                      value={rule?.current_sequence_number ?? 0}
                      disabled
                      className="font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Next Sequence</Label>
                    <Input
                      value={rule?.next_sequence_number ?? 1}
                      disabled
                      className="font-mono font-bold"
                    />
                  </div>
                </>
              ) : null}
            </ERPFieldGrid>
          </ERPDrawerSection>

          {/* Section 5 — Generation Policy */}
          <ERPDrawerSection id="policy" activeId={activeSection} title="Generation Policy">
            <ERPFieldGrid>
              <div className="space-y-3 col-span-12">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="reserve_on_draft"
                    name="reserve_on_draft"
                    defaultChecked={rule?.reserve_on_draft ?? false}
                    disabled={isViewing}
                  />
                  <Label htmlFor="reserve_on_draft" className="text-sm font-normal cursor-pointer">
                    Reserve On Draft
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="reserve_on_submit"
                    name="reserve_on_submit"
                    defaultChecked={rule?.reserve_on_submit ?? true}
                    disabled={isViewing}
                  />
                  <Label htmlFor="reserve_on_submit" className="text-sm font-normal cursor-pointer">
                    Reserve On Submit
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="allow_manual_override"
                    name="allow_manual_override"
                    defaultChecked={rule?.allow_manual_override ?? false}
                    disabled={isViewing}
                  />
                  <Label htmlFor="allow_manual_override" className="text-sm font-normal cursor-pointer">
                    Allow Manual Override
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="manual_override_requires_permission"
                    name="manual_override_requires_permission"
                    defaultChecked={rule?.manual_override_requires_permission ?? true}
                    disabled={isViewing}
                  />
                  <Label htmlFor="manual_override_requires_permission" className="text-sm font-normal cursor-pointer">
                    Manual Override Requires Permission
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="allow_gaps"
                    name="allow_gaps"
                    defaultChecked={rule?.allow_gaps ?? true}
                    disabled={isViewing}
                  />
                  <Label htmlFor="allow_gaps" className="text-sm font-normal cursor-pointer">
                    Allow Gaps in Sequence
                  </Label>
                </div>
              </div>

              <div className="space-y-2 col-span-6">
                <Label htmlFor="cancelled_number_policy" className="text-muted-foreground text-xs">
                  Cancelled Number Policy
                </Label>
                <Select
                  name="cancelled_number_policy"
                  defaultValue={rule?.cancelled_number_policy ?? "never_reuse"}
                  disabled={isViewing}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never_reuse">Never Reuse</SelectItem>
                    <SelectItem value="allow_reuse">Allow Reuse</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-6">
                <Label htmlFor="duplicate_prevention_scope" className="text-muted-foreground text-xs">
                  Duplicate Prevention Scope
                </Label>
                <Input
                  id="duplicate_prevention_scope"
                  name="duplicate_prevention_scope"
                  defaultValue={rule?.duplicate_prevention_scope ?? "document_type"}
                  disabled={isViewing}
                  maxLength={100}
                />
              </div>
            </ERPFieldGrid>
          </ERPDrawerSection>

          {/* Section 6 — Audit Info (Read-only) */}
          {/* lazyMount: display-only inputs (no name attr), no FormData contribution */}
          <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
            {rule ? (
              <ERPFieldGrid>
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
              </ERPFieldGrid>
            ) : (
              <div className="text-sm text-muted-foreground">Audit information will be available after saving</div>
            )}
          </ERPDrawerSection>

          {/* Section 7 — Notes */}
          <ERPDrawerSection id="notes" activeId={activeSection} title="Internal Notes">
            <ERPFieldGrid>
              <div className="space-y-2 col-span-12">
                <Label htmlFor="notes" className="text-muted-foreground text-xs">
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  name="notes"
                  defaultValue={rule?.notes ?? ""}
                  disabled={isViewing}
                  placeholder="Internal notes about this numbering rule..."
                  maxLength={1000}
                  rows={4}
                />
              </div>
            </ERPFieldGrid>
          </ERPDrawerSection>
          </ERPDrawerBody>

          <ERPFormFooter
            mode={isViewing ? "view" : isEditing ? "edit" : "add"}
            onCancel={() => onOpenChange(false)}
            onSave={isViewing ? undefined : () => handleSave()}
            onSaveAndClose={isViewing ? undefined : () => handleSaveAndClose()}
            isSubmitting={isSubmitting}
            hasUnsavedChanges={isDirty}
          />
        </div>
      </form>
    </ERPDrawerForm>
  );
}
