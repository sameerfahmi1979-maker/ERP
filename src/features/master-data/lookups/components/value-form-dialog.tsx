"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { LookupValue, LookupCategory } from "@/features/master-data/lookups/types";
import { createLookupValueSchema, updateLookupValueSchema } from "@/features/master-data/lookups/validation";
import { createLookupValue, updateLookupValue } from "@/server/actions/master-data/lookups";
import { RequiredLabel } from "@/components/erp/required-label";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import {
  FileText,
  Layers,
  Calendar,
  Shield,
  Info,
  Palette,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateAllLookups } from "@/lib/query/invalidation";

type ValueFormDialogProps = {
  value?: LookupValue | null;
  categories: LookupCategory[];
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function ValueFormDialog({
  value,
  categories,
  mode,
  open,
  onOpenChange,
  onSuccess,
}: ValueFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    value?.category_id ?? null
  );
  const [availableParentValues, setAvailableParentValues] = useState<LookupValue[]>([]);
  const [colorPreview, setColorPreview] = useState(value?.color_hex ?? "");
  
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const queryClient = useQueryClient();
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  // Get the selected category
  const selectedCategory = categories.find((cat) => cat.id === selectedCategoryId);

  // Load parent values when category changes
  useEffect(() => {
    if (selectedCategoryId && selectedCategory?.supports_hierarchy) {
      // TODO: Fetch available parent values for this category
      // For now, we'll set empty array
      setAvailableParentValues([]);
    } else {
      setAvailableParentValues([]);
    }
  }, [selectedCategoryId, selectedCategory]);

  // Reset form when value changes
  useEffect(() => {
    if (value) {
      setSelectedCategoryId(value.category_id);
      setColorPreview(value.color_hex ?? "");
    } else {
      setSelectedCategoryId(categories[0]?.id ?? null);
      setColorPreview("");
    }
  }, [value, categories]);

  const sections = [
    { id: "basic", label: "Basic Info", icon: FileText },
    { id: "hierarchy", label: "Hierarchy & Display", icon: Layers },
    { id: "dates", label: "Effective Dates", icon: Calendar },
    { id: "status", label: "Status & Governance", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    
    if (isViewing) return;

    const form = document.getElementById("drawer-form") as HTMLFormElement;
    const formData = new FormData(form);

    // Parse metadata JSON if provided
    let metadataJson: Record<string, unknown> = {};
    const metadataStr = formData.get("metadata_json") as string;
    if (metadataStr && metadataStr.trim()) {
      try {
        metadataJson = JSON.parse(metadataStr);
      } catch (error) {
        toast.error("Invalid JSON in metadata field");
        return false;
      }
    }

    setIsSubmitting(true);

    // Build data object
    const data = {
      category_id: parseInt(formData.get("category_id") as string),
      value_code: (formData.get("value_code") as string).toUpperCase(),
      value_label_en: formData.get("value_label_en") as string,
      value_label_ar: (formData.get("value_label_ar") as string) || null,
      description: (formData.get("description") as string) || null,
      parent_value_id: formData.get("parent_value_id")
        ? parseInt(formData.get("parent_value_id") as string)
        : null,
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

    try {
      // Validate with Zod
      let validatedData;
      if (isEditing && value) {
        validatedData = updateLookupValueSchema.parse({ id: value.id, ...data });
      } else {
        validatedData = createLookupValueSchema.parse(data);
      }

      let result;
      if (isEditing && value) {
        result = await updateLookupValue(validatedData as any);
      } else {
        result = await createLookupValue(validatedData as any);
      }

      if (result.success) {
        toast.success(`Lookup value ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        invalidateAllLookups(queryClient);
        if (onSuccess) {
          onSuccess();
        }
        return true;
      } else {
        toast.error(result.error ?? "Failed to save lookup value");
        return false;
      }
    } catch (error: any) {
      console.error("Form submission error", error);
      if (error.errors) {
        // Zod validation errors
        const firstError = error.errors[0];
        toast.error(`Validation Error: ${firstError.message}`);
      } else {
        toast.error("An unexpected error occurred");
      }
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
          ? "View Lookup Value"
          : isEditing
          ? "Edit Lookup Value"
          : "Add Lookup Value"
      }
      subtitle={value ? `Value Code: ${value.value_code}` : "Create a new lookup value"}
      recordNumber={value ? value.value_code : undefined}
      mode={mode}
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
                  <RequiredLabel htmlFor="category_id">
                    Category
                  </RequiredLabel>
                  <Select
                    name="category_id"
                    value={selectedCategoryId?.toString()}
                    onValueChange={(val) => setSelectedCategoryId(val ? parseInt(val) : null)}
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
                  <span className="text-[9px] text-muted-foreground">
                    Cannot be changed after creation
                  </span>
                </div>

                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="value_code">
                    Value Code
                  </RequiredLabel>
                  <Input
                    id="value_code"
                    name="value_code"
                    required
                    defaultValue={value?.value_code}
                    disabled={isViewing || isEditing}
                    placeholder="PENDING"
                    className="uppercase"
                    maxLength={100}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Unique within category (uppercase, alphanumeric with underscores)
                  </span>
                </div>

                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="value_label_en">
                    Label (English)
                  </RequiredLabel>
                  <Input
                    id="value_label_en"
                    name="value_label_en"
                    required
                    defaultValue={value?.value_label_en}
                    disabled={isViewing}
                    placeholder="Pending"
                    maxLength={200}
                  />
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="value_label_ar" className="text-muted-foreground text-xs">
                    Label (Arabic)
                  </Label>
                  <Input
                    id="value_label_ar"
                    name="value_label_ar"
                    defaultValue={value?.value_label_ar ?? ""}
                    disabled={isViewing}
                    placeholder="قيد الانتظار"
                    maxLength={200}
                    dir="rtl"
                  />
                </div>

                <div className="space-y-2 col-span-12">
                  <Label htmlFor="description" className="text-muted-foreground text-xs">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    name="description"
                    defaultValue={value?.description ?? ""}
                    disabled={isViewing}
                    placeholder="Optional description of this lookup value"
                    maxLength={1000}
                    rows={2}
                  />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 2 — Hierarchy and Display */}
            <ERPDrawerSection id="hierarchy" activeId={activeSection} title="Hierarchy & Display">
              <ERPFieldGrid>
                {selectedCategory?.supports_hierarchy && (
                  <div className="space-y-2 col-span-6">
                    <Label htmlFor="parent_value_id" className="text-muted-foreground text-xs">
                      Parent Value
                    </Label>
                    <Select
                      name="parent_value_id"
                      defaultValue={value?.parent_value_id?.toString()}
                      disabled={isViewing}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None (root level)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None (root level)</SelectItem>
                        {availableParentValues.map((pv) => (
                          <SelectItem key={pv.id} value={pv.id.toString()}>
                            {pv.value_label_en} ({pv.value_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-[9px] text-muted-foreground">
                      Optional parent for hierarchical categories
                    </span>
                  </div>
                )}

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="sort_order" className="text-muted-foreground text-xs">
                    Sort Order
                  </Label>
                  <Input
                    id="sort_order"
                    name="sort_order"
                    type="number"
                    min={0}
                    defaultValue={value?.sort_order ?? 0}
                    disabled={isViewing}
                    placeholder="0"
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Controls display order (0 = first)
                  </span>
                </div>

                {selectedCategory?.supports_color && (
                  <>
                    <div className="space-y-2 col-span-6">
                      <Label htmlFor="color_hex" className="text-muted-foreground text-xs">
                        Color (Hex)
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="color_hex"
                          name="color_hex"
                          defaultValue={value?.color_hex ?? ""}
                          disabled={isViewing}
                          placeholder="#22C55E"
                          maxLength={7}
                          className="font-mono"
                          onChange={(e) => setColorPreview(e.target.value)}
                        />
                        {colorPreview && (
                          <div
                            className="w-10 h-10 rounded-md border-2 border-border"
                            style={{ backgroundColor: colorPreview }}
                          />
                        )}
                      </div>
                      <span className="text-[9px] text-muted-foreground">
                        Format: #RRGGBB (e.g., #22C55E for green)
                      </span>
                    </div>

                    <div className="space-y-2 col-span-6">
                      <Label htmlFor="badge_variant" className="text-muted-foreground text-xs">
                        Badge Variant
                      </Label>
                      <Select
                        name="badge_variant"
                        defaultValue={value?.badge_variant ?? "default"}
                        disabled={isViewing}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
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
                    <Label htmlFor="icon_name" className="text-muted-foreground text-xs">
                      Icon Name
                    </Label>
                    <Input
                      id="icon_name"
                      name="icon_name"
                      defaultValue={value?.icon_name ?? ""}
                      disabled={isViewing}
                      placeholder="CheckCircle"
                      maxLength={50}
                    />
                    <span className="text-[9px] text-muted-foreground">
                      Lucide icon name (e.g., CheckCircle, AlertTriangle)
                    </span>
                  </div>
                )}

                {/* Badge Preview Card */}
                {colorPreview && selectedCategory?.supports_color && (
                  <div className="col-span-12">
                    <Card className="bg-indigo-500/5 border-indigo-500/20">
                      <CardContent className="p-4 flex items-center gap-3">
                        <Palette className="h-5 w-5 text-indigo-500" />
                        <div>
                          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Badge Preview
                          </div>
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
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 3 — Effective Dates and Metadata */}
            <ERPDrawerSection id="dates" activeId={activeSection} title="Effective Dates & Metadata">
              <ERPFieldGrid>
                {selectedCategory?.supports_effective_dates && (
                  <>
                    <div className="space-y-2 col-span-6">
                      <Label htmlFor="effective_from" className="text-muted-foreground text-xs">
                        Effective From
                      </Label>
                      <Input
                        id="effective_from"
                        name="effective_from"
                        type="date"
                        defaultValue={value?.effective_from?.split("T")[0] ?? ""}
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
                        defaultValue={value?.effective_to?.split("T")[0] ?? ""}
                        disabled={isViewing}
                      />
                    </div>
                  </>
                )}

                {selectedCategory?.supports_metadata && (
                  <div className="space-y-2 col-span-12">
                    <Label htmlFor="metadata_json" className="text-muted-foreground text-xs">
                      Metadata (JSON)
                    </Label>
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
                    <span className="text-[9px] text-muted-foreground">
                      Optional JSON object for custom attributes
                    </span>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 4 — Status and Governance */}
            <ERPDrawerSection id="status" activeId={activeSection} title="Status & Governance">
              <ERPFieldGrid>
                <div className="space-y-3 col-span-12">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_active"
                      name="is_active"
                      defaultChecked={value?.is_active ?? true}
                      disabled={isViewing}
                    />
                    <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">
                      Active
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_default"
                      name="is_default"
                      defaultChecked={value?.is_default ?? false}
                      disabled={isViewing}
                    />
                    <Label htmlFor="is_default" className="text-sm font-normal cursor-pointer">
                      Set as Default
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_locked"
                      name="is_locked"
                      defaultChecked={value?.is_locked ?? false}
                      disabled={isViewing || !hasLockPermission()}
                    />
                    <Label htmlFor="is_locked" className="text-sm font-normal cursor-pointer">
                      Locked (Prevent Modification)
                    </Label>
                  </div>
                </div>

                {value?.is_system && (
                  <div className="col-span-12">
                    <Card className="bg-amber-500/5 border-amber-500/20">
                      <CardContent className="p-4 flex items-center gap-3">
                        <Shield className="h-5 w-5 text-amber-500" />
                        <div className="text-xs text-amber-600 dark:text-amber-400">
                          <strong>System Value:</strong> This value is managed by the system and
                          cannot be deleted.
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 5 — Audit Information */}
            <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
              {value ? (
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input
                      value={new Date(value.created_at).toLocaleString()}
                      disabled
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input
                      value={new Date(value.updated_at).toLocaleString()}
                      disabled
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created By</Label>
                    <Input value={value.created_by ?? "—"} disabled className="text-xs" />
                  </div>

                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated By</Label>
                    <Input value={value.updated_by ?? "—"} disabled className="text-xs" />
                  </div>
                </ERPFieldGrid>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Audit information will be available after saving
                </div>
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

// Helper function to check lock permission (placeholder)
function hasLockPermission(): boolean {
  // TODO: Implement actual permission check
  // For now, return true to allow locking
  return true;
}
