"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import type { LookupValue, LookupCategory } from "@/features/master-data/lookups/types";
import { createLookupValueSchema, updateLookupValueSchema } from "@/features/master-data/lookups/validation";
import { createLookupValue, updateLookupValue } from "@/server/actions/master-data/lookups";
import { RequiredLabel } from "@/components/erp/required-label";
import { FileText, Layers, Calendar, Shield, Info, Palette } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateAllLookups } from "@/lib/query/invalidation";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  ERPRecordWorkspaceForm,
  ERPRecordSectionPanel,
} from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type LookupValueWorkspaceFormProps = {
  value?: LookupValue | null;
  categories: LookupCategory[];
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "lookup-value-workspace-form";

export function LookupValueWorkspaceForm({ value, categories, mode }: LookupValueWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty } = useWorkspace();
  const queryClient = useQueryClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [colorPreview, setColorPreview] = useState(value?.color_hex ?? "");

  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(() => {
    const d = getDraftDefault("category_id", "");
    return d ? Number(d) : value?.category_id ?? (categories[0]?.id ?? null);
  });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  useEffect(() => {
    if (value) {
      setSelectedCategoryId(value.category_id);
      setColorPreview(value.color_hex ?? "");
    }
  }, [value]);

  const selectedCategory = categories.find((cat) => cat.id === selectedCategoryId);

  const sections = [
    { id: "basic", label: "Basic Info", icon: FileText },
    { id: "display", label: "Display & Hierarchy", icon: Layers },
    { id: "dates", label: "Effective Dates", icon: Calendar },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);

    let metadataJson: Record<string, unknown> = {};
    const metadataStr = formData.get("metadata_json") as string;
    if (metadataStr && metadataStr.trim()) {
      try {
        metadataJson = JSON.parse(metadataStr);
      } catch {
        toast.error("Invalid JSON in metadata field");
        return false;
      }
    }

    setIsSubmitting(true);
    try {
      const data = {
        category_id: parseInt(formData.get("category_id") as string),
        value_code: (formData.get("value_code") as string).toUpperCase(),
        value_label_en: formData.get("value_label_en") as string,
        value_label_ar: (formData.get("value_label_ar") as string) || null,
        description: (formData.get("description") as string) || null,
        parent_value_id: formData.get("parent_value_id") ? parseInt(formData.get("parent_value_id") as string) : null,
        color_hex: (formData.get("color_hex") as string) || null,
        icon_name: (formData.get("icon_name") as string) || null,
        badge_variant: (formData.get("badge_variant") as string) || null,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
        is_default: formData.get("is_default") === "on",
        is_active: formData.get("is_active") === "on",
        is_locked: formData.get("is_locked") === "on",
        effective_from: (formData.get("effective_from") as string) || null,
        effective_to: (formData.get("effective_to") as string) || null,
        metadata_json: metadataJson,
      };

      let validatedData;
      try {
        if (isEditing && value) {
          validatedData = updateLookupValueSchema.parse({ id: value.id, ...data });
        } else {
          validatedData = createLookupValueSchema.parse(data);
        }
      } catch (error: unknown) {
        const zodError = error as { errors?: { message: string }[] };
        if (zodError.errors) {
          toast.error(`Validation Error: ${zodError.errors[0].message}`);
        } else {
          toast.error("Validation failed");
        }
        return false;
      }

      let result;
      if (isEditing && value) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = await updateLookupValue(validatedData as any);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = await createLookupValue(validatedData as any);
      }

      if (result.success) {
        toast.success(`Lookup value ${isEditing ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();
        invalidateAllLookups(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save lookup value");
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
      title={isViewing ? "View Lookup Value" : isEditing ? "Edit Lookup Value" : "New Lookup Value"}
      subtitle={value ? `Value Code: ${value.value_code}` : "Create a new lookup value"}
      recordCode={value?.value_code}
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
              <RequiredLabel htmlFor="category_id">Category</RequiredLabel>
              <Select
                name="category_id"
                value={selectedCategoryId?.toString()}
                onValueChange={(val) => { const n = val ? parseInt(val) : null; setSelectedCategoryId(n); writeDraftField("category_id", n ?? ""); }}
                disabled={isViewing || isEditing}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.category_name_en} ({cat.category_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[9px] text-muted-foreground">Cannot be changed after creation</span>
            </div>

            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="value_code">Value Code</RequiredLabel>
              <Input
                id="value_code"
                name="value_code"
                required
                defaultValue={getDraftDefault("value_code", value?.value_code ?? "")}
                disabled={isViewing || isEditing}
                placeholder="PENDING"
                className="uppercase"
                maxLength={100}
              />
              <span className="text-[9px] text-muted-foreground">Unique within category (uppercase, alphanumeric with underscores)</span>
            </div>

            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="value_label_en">Label (English)</RequiredLabel>
              <Input
                id="value_label_en"
                name="value_label_en"
                required
                defaultValue={getDraftDefault("value_label_en", value?.value_label_en ?? "")}
                disabled={isViewing}
                placeholder="Pending"
                maxLength={200}
              />
            </div>

            <div className="space-y-2 col-span-6">
              <Label htmlFor="value_label_ar" className="text-muted-foreground text-xs">Label (Arabic)</Label>
              <Input
                id="value_label_ar"
                name="value_label_ar"
                defaultValue={getDraftDefault("value_label_ar", value?.value_label_ar ?? "")}
                disabled={isViewing}
                placeholder="قيد الانتظار"
                maxLength={200}
                dir="rtl"
              />
            </div>

            <div className="space-y-2 col-span-12">
              <Label htmlFor="description" className="text-muted-foreground text-xs">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={getDraftDefault("description", value?.description ?? "")}
                disabled={isViewing}
                placeholder="Optional description of this lookup value"
                maxLength={1000}
                rows={2}
              />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="display" activeId={activeSection} title="Display & Hierarchy">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input
                id="sort_order"
                name="sort_order"
                type="number"
                min={0}
                defaultValue={getDraftDefault("sort_order", value?.sort_order ?? 0)}
                disabled={isViewing}
                placeholder="0"
              />
              <span className="text-[9px] text-muted-foreground">Controls display order (0 = first)</span>
            </div>

            {selectedCategory?.supports_color && (
              <>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="color_hex" className="text-muted-foreground text-xs">Color (Hex)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="color_hex"
                      name="color_hex"
                      defaultValue={getDraftDefault("color_hex", value?.color_hex ?? "")}
                      disabled={isViewing}
                      placeholder="#22C55E"
                      maxLength={7}
                      className="font-mono"
                      onChange={(e) => setColorPreview(e.target.value)}
                    />
                    {colorPreview && (
                      <div className="w-10 h-10 rounded-md border-2 border-border flex-shrink-0" style={{ backgroundColor: colorPreview }} />
                    )}
                  </div>
                  <span className="text-[9px] text-muted-foreground">Format: #RRGGBB (e.g., #22C55E for green)</span>
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="badge_variant" className="text-muted-foreground text-xs">Badge Variant</Label>
                  <Select name="badge_variant" defaultValue={getDraftDefault("badge_variant", value?.badge_variant ?? "default")} disabled={isViewing}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="destructive">Destructive</SelectItem>
                      <SelectItem value="outline">Outline</SelectItem>
                      <SelectItem value="secondary">Secondary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {selectedCategory?.supports_icon && (
              <div className="space-y-2 col-span-6">
                <Label htmlFor="icon_name" className="text-muted-foreground text-xs">Icon Name</Label>
                <Input
                  id="icon_name"
                  name="icon_name"
                  defaultValue={getDraftDefault("icon_name", value?.icon_name ?? "")}
                  disabled={isViewing}
                  placeholder="CheckCircle"
                  maxLength={50}
                />
                <span className="text-[9px] text-muted-foreground">Lucide icon name (e.g., CheckCircle, AlertTriangle)</span>
              </div>
            )}

            {colorPreview && selectedCategory?.supports_color && (
              <div className="col-span-12">
                <Card className="bg-indigo-500/5 border-indigo-500/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Palette className="h-5 w-5 text-indigo-500" />
                    <div>
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Badge Preview</div>
                      <Badge
                        variant="outline"
                        style={{
                          backgroundColor: `${colorPreview}15`,
                          borderColor: `${colorPreview}40`,
                          color: colorPreview,
                        }}
                      >
                        {value?.value_label_en || "Preview"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="dates" activeId={activeSection} title="Effective Dates & Metadata">
          <div className="grid grid-cols-12 gap-4">
            {selectedCategory?.supports_effective_dates && (
              <>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="effective_from" className="text-muted-foreground text-xs">Effective From</Label>
                  <Input
                    id="effective_from"
                    name="effective_from"
                    type="date"
                    defaultValue={getDraftDefault("effective_from", value?.effective_from?.split("T")[0] ?? "")}
                    disabled={isViewing}
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="effective_to" className="text-muted-foreground text-xs">Effective To</Label>
                  <Input
                    id="effective_to"
                    name="effective_to"
                    type="date"
                    defaultValue={getDraftDefault("effective_to", value?.effective_to?.split("T")[0] ?? "")}
                    disabled={isViewing}
                  />
                </div>
              </>
            )}
            {selectedCategory?.supports_metadata && (
              <div className="space-y-2 col-span-12">
                <Label htmlFor="metadata_json" className="text-muted-foreground text-xs">Metadata (JSON)</Label>
                <Textarea
                  id="metadata_json"
                  name="metadata_json"
                  defaultValue={
                    value?.metadata_json && Object.keys(value.metadata_json).length > 0
                      ? JSON.stringify(value.metadata_json, null, 2)
                      : ""
                  }
                  disabled={isViewing}
                  placeholder='{"key": "value"}'
                  rows={4}
                  className="font-mono text-xs"
                />
                <span className="text-[9px] text-muted-foreground">Optional JSON object for custom attributes</span>
              </div>
            )}
            {!selectedCategory?.supports_effective_dates && !selectedCategory?.supports_metadata && (
              <div className="col-span-12">
                <p className="text-sm text-muted-foreground italic">
                  No effective dates or metadata supported by the selected category.
                </p>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status and Governance">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", value?.is_active ?? true)} disabled={isViewing} />
                <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="is_default" name="is_default" defaultChecked={getDraftBoolean("is_default", value?.is_default ?? false)} disabled={isViewing} />
                <Label htmlFor="is_default" className="text-sm font-normal cursor-pointer">Set as Default</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="is_locked" name="is_locked" defaultChecked={getDraftBoolean("is_locked", value?.is_locked ?? false)} disabled={isViewing} />
                <Label htmlFor="is_locked" className="text-sm font-normal cursor-pointer">Locked (Prevent Modification)</Label>
              </div>
            </div>
            {value?.is_system && (
              <div className="col-span-12">
                <Card className="bg-amber-500/5 border-amber-500/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Shield className="h-5 w-5 text-amber-500" />
                    <div className="text-xs text-amber-600 dark:text-amber-400">
                      <strong>System Value:</strong> This value is managed by the system and cannot be deleted.
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {value ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(value.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(value.updated_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created By</Label>
                <Input value={value.created_by ?? "—"} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated By</Label>
                <Input value={value.updated_by ?? "—"} disabled className="text-xs" />
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
