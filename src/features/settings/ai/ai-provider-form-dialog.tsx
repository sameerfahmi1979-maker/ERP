"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox/erp-combobox";
import { Brain } from "lucide-react";
import type { AiProviderConfig } from "@/lib/ai/providers/types";
import {
  createAiProviderConfig,
  updateAiProviderConfig,
} from "@/server/actions/settings/ai-settings";

interface AiProviderFormDialogProps {
  open: boolean;
  config?: AiProviderConfig | null;
  onClose: () => void;
  onSaved: () => void;
}

type ProviderType =
  | "openai" | "azure_openai" | "azure_document_intelligence"
  | "google_document_ai" | "aws_textract" | "tesseract"
  | "local_ollama" | "local_custom";

type Purpose =
  | "general" | "chat" | "ocr" | "classification" | "extraction"
  | "embedding" | "dms" | "assistant";

type FormState = {
  config_code: string;
  provider_type: ProviderType;
  provider_name: string;
  api_endpoint: string;
  model_id: string;
  api_version: string;
  purpose: Purpose;
  is_default: boolean;
  is_enabled: boolean;
  requires_human_review: boolean;
  confidence_threshold: string;
  notes: string;
};

const PROVIDER_TYPES: { value: ProviderType; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "azure_openai", label: "Azure OpenAI" },
  { value: "azure_document_intelligence", label: "Azure Document Intelligence" },
  { value: "google_document_ai", label: "Google Document AI" },
  { value: "aws_textract", label: "AWS Textract" },
  { value: "tesseract", label: "Tesseract (Local OCR)" },
  { value: "local_ollama", label: "Local Ollama LLM" },
  { value: "local_custom", label: "Custom Local Provider" },
];

const PURPOSES: { value: Purpose; label: string }[] = [
  { value: "general", label: "General" },
  { value: "chat", label: "Chat" },
  { value: "ocr", label: "OCR" },
  { value: "classification", label: "Classification" },
  { value: "extraction", label: "Extraction" },
  { value: "embedding", label: "Embedding" },
  { value: "dms", label: "DMS" },
  { value: "assistant", label: "Assistant" },
];

export function AiProviderFormDialog({
  open,
  config,
  onClose,
  onSaved,
}: AiProviderFormDialogProps) {
  const isEdit = !!config;

  const [form, setForm] = useState<FormState>({
    config_code: config?.configCode ?? "",
    provider_type: (config?.providerType as ProviderType) ?? "openai",
    provider_name: config?.providerName ?? "",
    api_endpoint: config?.apiEndpoint ?? "",
    model_id: config?.modelId ?? "",
    api_version: config?.apiVersion ?? "",
    purpose: (config?.purpose as Purpose) ?? "general",
    is_default: config?.isDefault ?? false,
    is_enabled: config?.isEnabled ?? false,
    requires_human_review: config?.requiresHumanReview ?? true,
    confidence_threshold: String(config?.confidenceThreshold ?? "0.85"),
    notes: config?.notes ?? "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.config_code.trim()) errs.config_code = "Required";
    if (!/^[A-Z0-9_]+$/.test(form.config_code)) errs.config_code = "Use uppercase letters, numbers and underscores only";
    if (!form.provider_name.trim()) errs.provider_name = "Required";
    const threshold = parseFloat(form.confidence_threshold);
    if (isNaN(threshold) || threshold < 0 || threshold > 1) {
      errs.confidence_threshold = "Must be between 0 and 1";
    }
    if (form.api_endpoint && !form.api_endpoint.match(/^https?:\/\/.+/)) {
      errs.api_endpoint = "Must be a valid URL (https://...)";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const payload = {
        config_code: form.config_code,
        provider_type: form.provider_type,
        provider_name: form.provider_name,
        api_endpoint: form.api_endpoint || null,
        model_id: form.model_id || null,
        api_version: form.api_version || null,
        purpose: form.purpose,
        is_default: form.is_default,
        is_enabled: form.is_enabled,
        is_active: true,
        requires_human_review: form.requires_human_review,
        confidence_threshold: parseFloat(form.confidence_threshold),
        notes: form.notes || null,
      };

      let result;
      if (isEdit && config) {
        result = await updateAiProviderConfig({ ...payload, id: config.id });
      } else {
        result = await createAiProviderConfig(payload);
      }

      if (result.success) {
        onSaved();
      } else {
        toast.error(result.error ?? "Failed to save provider");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? "Edit AI Provider" : "Add AI Provider"}
      subtitle="Configure a non-sensitive AI provider. API keys are managed separately."
      icon={<Brain className="h-5 w-5 text-violet-500" />}
      mode={isEdit ? "edit" : "add"}
      size="md"
      isSubmitting={isSubmitting}
      onCancel={onClose}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? "Save Changes" : "Add Provider"}
    >
      <div className="grid gap-4 py-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="config_code">
              Config Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="config_code"
              value={form.config_code}
              onChange={(e) => set("config_code", e.target.value.toUpperCase())}
              placeholder="DEFAULT_CHAT"
              className="font-mono uppercase"
              disabled={isEdit}
            />
            {errors.config_code && <p className="text-xs text-destructive">{errors.config_code}</p>}
            <p className="text-xs text-muted-foreground">Unique identifier. Uppercase only.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>
              Provider Type <span className="text-destructive">*</span>
            </Label>
            <ERPCombobox
              value={form.provider_type}
              onValueChange={(v) => set("provider_type", (v ?? "openai") as ProviderType)}
              options={PROVIDER_TYPES.map((pt) => ({ value: pt.value, label: pt.label }))}
              placeholder="Select provider type..."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provider_name">
              Provider Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="provider_name"
              value={form.provider_name}
              onChange={(e) => set("provider_name", e.target.value)}
              placeholder="e.g. OpenAI GPT"
            />
            {errors.provider_name && (
              <p className="text-xs text-destructive">{errors.provider_name}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>
              Purpose <span className="text-destructive">*</span>
            </Label>
            <ERPCombobox
              value={form.purpose}
              onValueChange={(v) => set("purpose", (v ?? "general") as Purpose)}
              options={PURPOSES.map((p) => ({ value: p.value, label: p.label }))}
              placeholder="Select purpose..."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model_id">Model ID</Label>
            <Input
              id="model_id"
              value={form.model_id}
              onChange={(e) => set("model_id", e.target.value)}
              placeholder="e.g. gpt-4o"
            />
            <p className="text-xs text-muted-foreground">Leave blank if not applicable.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="api_version">API Version</Label>
            <Input
              id="api_version"
              value={form.api_version}
              onChange={(e) => set("api_version", e.target.value)}
              placeholder="e.g. 2024-02-01 (Azure)"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="api_endpoint">API Endpoint</Label>
          <Input
            id="api_endpoint"
            value={form.api_endpoint}
            onChange={(e) => set("api_endpoint", e.target.value)}
            placeholder="https://... (required for Azure/local providers)"
          />
          {errors.api_endpoint && (
            <p className="text-xs text-destructive">{errors.api_endpoint}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Required for Azure, Ollama, or custom providers. Leave blank for OpenAI default.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confidence_threshold">
            Confidence Threshold
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="confidence_threshold"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={form.confidence_threshold}
              onChange={(e) => set("confidence_threshold", e.target.value)}
              className="w-28"
            />
            <span className="text-sm text-muted-foreground">
              ({(parseFloat(form.confidence_threshold || "0") * 100).toFixed(0)}%)
            </span>
          </div>
          {errors.confidence_threshold && (
            <p className="text-xs text-destructive">{errors.confidence_threshold}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Minimum confidence score (0–1) before results are accepted without human review.
          </p>
        </div>

        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Switch
              id="is_enabled"
              checked={form.is_enabled}
              onCheckedChange={(v) => set("is_enabled", v)}
            />
            <Label htmlFor="is_enabled" className="cursor-pointer">Enabled</Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="is_default"
              checked={form.is_default}
              onCheckedChange={(v) => set("is_default", v)}
            />
            <Label htmlFor="is_default" className="cursor-pointer">Default for purpose</Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="requires_human_review"
              checked={form.requires_human_review}
              onCheckedChange={(v) => set("requires_human_review", v)}
            />
            <Label htmlFor="requires_human_review" className="cursor-pointer">
              Requires human review
            </Label>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            placeholder="Optional notes about this provider configuration..."
          />
        </div>
      </div>
    </ERPChildDialogForm>
  );
}
