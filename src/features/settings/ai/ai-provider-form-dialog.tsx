"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox/erp-combobox";
import { Brain, Eye, EyeOff, KeyRound } from "lucide-react";
import type { AiProviderConfig } from "@/lib/ai/providers/types";
import {
  createAiProviderConfig,
  updateAiProviderConfig,
  saveAiProviderSecret,
} from "@/server/actions/settings/ai-settings";
import { ENV_VAR_SUGGESTIONS } from "./ai-provider-secret-dialog";

interface AiProviderFormDialogProps {
  canManageSecrets?: boolean;
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

export function AiProviderFormDialog(props: AiProviderFormDialogProps) {
  return props.open ? <ProviderFormSession key={props.config?.id ?? "new"} {...props} /> : null;
}

function ProviderFormSession({
  open,
  config,
  onClose,
  onSaved,
  canManageSecrets = false,
}: AiProviderFormDialogProps) {
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const isEdit = !!config || createdId !== null;

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

  // API key (optional) — persisted to the server env file, never to the DB
  const [secretRef, setSecretRef] = useState(
    config?.secretRef ?? ENV_VAR_SUGGESTIONS[config?.providerType ?? "openai"] ?? ""
  );
  const [secretValue, setSecretValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [secretError, setSecretError] = useState<string | null>(null);

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

    let secretOk = true;
    if (secretValue.trim() && !secretRef.trim()) {
      setSecretError("Environment variable name is required when entering an API key");
      secretOk = false;
    } else if (/^https?:\/\//i.test(secretValue.trim())) {
      setSecretError("This looks like a URL — paste the API key (KEY 1), not the endpoint. The endpoint goes in the API Endpoint field above.");
      secretOk = false;
    }
    return Object.keys(errs).length === 0 && secretOk;
  };

  const handleSubmit = async () => {
    if (uncertain || isSubmitting) return;
    if (!validate()) return;
    setIsSubmitting(true);
    setSaveError(null);
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
      let configId: number | undefined = config?.id ?? createdId ?? undefined;
      if (configId !== undefined) {
        result = await updateAiProviderConfig({ ...payload, id: configId });
      } else {
        const createResult = await createAiProviderConfig(payload);
        result = createResult;
        if (createResult.success) { configId = createResult.data?.id; if (configId !== undefined) setCreatedId(configId); }
      }

      if (!result.success) {
        setSaveError("The provider was not saved. Check the values and your permissions, then try again.");
        return;
      }

      // If an API key was entered, persist it to the server env and apply it
      if (canManageSecrets && secretValue.trim() && configId != null) {
        const secretResult = await saveAiProviderSecret({
          id: configId,
          secret_value: secretValue,
          secret_ref: secretRef.trim(),
        });
        if (!secretResult.success) {
          setSaveError("Provider saved, but the API key was not saved. Retry updates this same provider; managed deployments may require administrator-controlled secret rotation.");
          return;
        }
        setSecretValue("");
        toast.success("Provider and key saved for this server. Multi-server deployments require coordinated secret rotation.");
      }

      onSaved();
    } catch {
      setUncertain(true);
      setSaveError("The save could not be confirmed. Close this dialog and refresh the provider list before retrying to avoid a duplicate.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? "Edit AI Provider" : "Add AI Provider"}
      subtitle="Configure the provider. Secret changes require separate permission and deployment support."
      icon={<Brain className="h-5 w-5 text-violet-500" />}
      mode={isEdit ? "edit" : "add"}
      size="md"
      isSubmitting={isSubmitting}
      submitDisabled={uncertain}
      onCancel={onClose}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? "Save Changes" : "Add Provider"}
    >
      {saveError && <div role="alert" className="rounded-sm border border-destructive p-3 text-sm text-destructive">{saveError}</div>}
      <div className="grid gap-4 py-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="config_code">
              Config Code <span className="text-destructive">*</span>
            </Label>
            <Input required
              id="config_code"
              pattern="[A-Z0-9_]+"
              maxLength={100}
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
            <ERPCombobox ariaLabel="Provider Type" required
              value={form.provider_type}
              onValueChange={(v) => {
                const next = (v ?? "openai") as ProviderType;
                set("provider_type", next);
                // Refresh env var suggestion unless the user customized it
                const isUntouched =
                  !secretRef.trim() ||
                  Object.values(ENV_VAR_SUGGESTIONS).includes(secretRef);
                if (!config?.secretRef && isUntouched) {
                  setSecretRef(ENV_VAR_SUGGESTIONS[next] ?? "");
                }
              }}
              options={PROVIDER_TYPES.map((pt) => ({ value: pt.value, label: pt.label }))}
              placeholder="Select provider type..."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provider_name">
              Provider Name <span className="text-destructive">*</span>
            </Label>
            <Input required
              id="provider_name"
              maxLength={200}
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
            <ERPCombobox ariaLabel="Purpose" required
              value={form.purpose}
              onValueChange={(v) => set("purpose", (v ?? "general") as Purpose)}
              options={PURPOSES.map((p) => ({ value: p.value, label: p.label }))}
              placeholder="Select purpose..."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            type="url"
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

        {canManageSecrets && <div className="rounded-md border p-3 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-medium">API Key</span>
            {config?.maskedSecretPreview && (
              <span className="ml-auto text-xs text-muted-foreground">
                Current: <code className="font-mono">{config.maskedSecretPreview}</code>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Server-file secret changes must be explicitly enabled by the deployment administrator.
            Managed deployments should use their deployment secret store. Plaintext keys are not saved in application records.
            {isEdit && " Leave blank to keep the current key."}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="secret_ref_inline">Environment Variable Name</Label>
              <Input
                id="secret_ref_inline"
                required={!!secretValue.trim()}
                value={secretRef}
                onChange={(e) => {
                  setSecretRef(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"));
                  setSecretError(null);
                }}
                placeholder="AZURE_DOCUMENT_INTELLIGENCE_KEY"
                className="font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="secret_value_inline">API Key Value</Label>
              <div className="relative">
                <Input
                  id="secret_value_inline"
                  maxLength={500}
                  pattern="(?!https?://).*"
                  type={showKey ? "text" : "password"}
                  value={secretValue}
                  onChange={(e) => {
                    setSecretValue(e.target.value);
                    setSecretError(null);
                  }}
                  placeholder={isEdit ? "Enter new key to replace..." : "Paste key here..."}
                  autoComplete="off"
                  className="font-mono pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                  aria-pressed={showKey}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          {secretError && <p className="text-xs text-destructive">{secretError}</p>}
        </div>}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confidence_threshold">
            Confidence Threshold
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="confidence_threshold"
              required
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
