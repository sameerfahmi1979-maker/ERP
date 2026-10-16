"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createWorkspaceSaveAttempt, type WorkspaceSaveContract } from "@/lib/workspace/save-contract";
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
import { aiProviderCreateSchema } from "@/lib/settings/provider-configuration";
import { FormErrorSummary, useInlineFieldFeedback } from "@/components/workspace/form-feedback";
import type { WorkspaceFieldIssue } from "@/lib/workspace/form-validation";

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
  const [revision, setRevision] = useState(config?.workspaceRevision ?? null);
  const attempt = useRef(createWorkspaceSaveAttempt());
  const pending = useRef<{id: number | null; payload: Parameters<typeof createAiProviderConfig>[0]; contract: WorkspaceSaveContract; fingerprint: string; hadUnknown: boolean} | null>(null);
  const flight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const confirmedRef = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const [displayError, setDisplayError] = useState(false);
  const router = useRouter();
  const display = (effect: () => void) => { try { effect(); } catch { if (alive.current) setDisplayError(true); } };
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

  const [policyIssues, setPolicyIssues] = useState<WorkspaceFieldIssue[]>([]);
  useInlineFieldFeedback(policyIssues);
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
    setPolicyIssues([]);
  };

  const validate = (retainedConfiguration?: Parameters<typeof createAiProviderConfig>[0]): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    const parsed = aiProviderCreateSchema.safeParse(retainedConfiguration ?? {...form,is_active:config?.isActive??true,api_endpoint:form.api_endpoint||null,api_version:form.api_version||null,confidence_threshold:form.confidence_threshold.trim()?Number(form.confidence_threshold):NaN});
    if(!parsed.success)for(const issue of parsed.error.issues)errs[issue.path[0] as keyof FormState]=issue.message;
    const issues:WorkspaceFieldIssue[]=Object.entries(errs).map(([key,message])=>({label:document.querySelector(`label[for="${key}"]`)?.textContent?.replace('*','').trim()||key.replaceAll('_',' '),message:message!,control:document.getElementById(key),section:null}));
    setPolicyIssues(issues);
    issues[0]?.control?.focus();

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
    if (flight.current || isSubmitting || confirmedRef.current) return;
    const fingerprint = JSON.stringify(form);
    if (pending.current && pending.current.fingerprint !== fingerprint) {
      setSaveError("Restore the submitted entries before retrying the original unconfirmed save.");
      return;
    }
    if (!validate(pending.current?.payload)) return;
    flight.current = true;
    setIsSubmitting(true);
    setSaveError(null);
    let dispatched: typeof pending.current = null;
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
        is_active: config?.isActive ?? true,
        requires_human_review: form.requires_human_review,
        confidence_threshold: Number(form.confidence_threshold),
        notes: form.notes || null,
      };

      let result;
      const request = pending.current ?? {id: config?.id ?? createdId ?? null, payload: {...payload}, contract: attempt.current.begin(payload, revision), fingerprint, hadUnknown: false};
      pending.current = request;
      dispatched = request;
      let configId: number | undefined = request.id ?? undefined;
      if (configId !== undefined) {
        result = await updateAiProviderConfig({ ...request.payload, id: configId }, request.contract);
      } else {
        const createResult = await createAiProviderConfig(request.payload, request.contract);
        result = createResult;
        if (!alive.current) return;
        if (createResult.success) { configId = createResult.data?.id; if (configId !== undefined) setCreatedId(configId); }
      }

      if (!alive.current) return;
      if (!result.success && (result.uncertain || request.hadUnknown)) {
        request.hadUnknown = true;
        setUncertain(true);
        setSaveError("Save unconfirmed. Restore the submitted entries and retry to recover the same operation, or reopen the current record to reconcile it.");
        return;
      }
      if (pending.current === request) { pending.current = null; attempt.current.resolved(); }
      setUncertain(false);
      if (!result.success) {
        setSaveError(result.error ?? "The provider save was not confirmed. Your entries are retained.");
        return;
      }
      if (result.data) setRevision(result.data.revision);
      // Configuration confirmation is terminal, independently of the optional key stage.
      confirmedRef.current = true;
      setConfirmed(true);

      // If an API key was entered, persist it to the server env and apply it
      if (canManageSecrets && secretValue.trim() && configId != null) {
        // Never keep a submitted key for automatic replay, including a generic false result.
        setSecretValue("");
        setShowKey(false);
        let keyConfirmed = false;
        try {
          const secretResult = await saveAiProviderSecret({id: configId, secret_value: secretValue, secret_ref: secretRef.trim()});
          keyConfirmed = secretResult.success;
        } catch { /* A key write may already have happened; do not claim rollback. */ }
        if (!alive.current) return;
        if (!keyConfirmed) {
          setSaveError("Provider saved, but the key update could not be confirmed. Check the provider and deployment secret status before starting a new key change. Refreshing settings does not retry the key.");
          return;
        }
        display(() => toast.success("Provider and key saved for this server. Multi-server deployments require coordinated secret rotation."));
      }

      display(onSaved);
    } catch {
      if (dispatched) dispatched.hadUnknown = true;
      if (alive.current) {
        setUncertain(true);
        setSaveError("Save unconfirmed. Restore the submitted entries and retry to recover the same operation, or reopen the current record to reconcile it.");
      }
    } finally {
      flight.current = false;
      if (alive.current) setIsSubmitting(false);
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={(o) => { if (!o) display(onClose); }}
      title={isEdit ? "Edit AI Provider" : "Add AI Provider"}
      subtitle="Configure the provider. Secret changes require separate permission and deployment support."
      icon={<Brain className="h-5 w-5 text-violet-500" />}
      mode={isEdit ? "edit" : "add"}
      size="md"
      isSubmitting={isSubmitting}
      submitDisabled={confirmed}
      isDirty={confirmed ? false : undefined}
      onSubmit={handleSubmit}
      submitLabel={uncertain ? "Retry unchanged save" : isEdit ? "Save Changes" : "Add Provider"}
    >
      <FormErrorSummary issues={policyIssues} onReveal={issue=>issue.control?.focus()} />
      {saveError && <div role="alert" className="rounded-sm border border-destructive p-3 text-sm text-destructive">{saveError}</div>}
      {confirmed && <div role="status" className="space-y-2"><p>Provider save confirmed. Reopen the current record before making another change.</p>{displayError && <p>The display could not finish updating. Confirmed saves remain confirmed.</p>}<Button type="button" variant="outline" onClick={() => display(() => router.refresh())}>Refresh settings only</Button></div>}
      <fieldset disabled={confirmed} className="grid gap-4 py-2">
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
              maxLength={200}
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
              pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}(-preview)?"
              maxLength={18}
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
            maxLength={500}
            value={form.api_endpoint}
            onChange={(e) => set("api_endpoint", e.target.value)}
            placeholder="https://... (required for Azure/local providers)"
          />
          <p className="text-xs text-muted-foreground">
            Use your Azure resource root, the standard OpenAI endpoint, or HTTP localhost for Ollama. Unsupported adapters must stay disabled. Blank uses the default for OpenAI or Ollama.
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
            maxLength={1000}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            placeholder="Optional notes about this provider configuration..."
          />
        </div>
      </fieldset>
    </ERPChildDialogForm>
  );
}
