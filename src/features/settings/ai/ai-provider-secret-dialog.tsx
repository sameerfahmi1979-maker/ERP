"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ShieldCheck, Eye, EyeOff } from "lucide-react";
import type { AiProviderConfig } from "@/lib/ai/providers/types";
import { saveAiProviderSecret } from "@/server/actions/settings/ai-settings";

const ENV_VAR_SUGGESTIONS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  azure_openai: "AZURE_OPENAI_API_KEY",
  azure_document_intelligence: "AZURE_DOCUMENT_INTELLIGENCE_KEY",
  google_document_ai: "GOOGLE_DOCUMENT_AI_KEY",
  aws_textract: "AWS_ACCESS_KEY_ID",
  tesseract: "",
  local_ollama: "LOCAL_LLM_ENDPOINT",
  local_custom: "CUSTOM_AI_API_KEY",
};

interface AiProviderSecretDialogProps {
  open: boolean;
  config: AiProviderConfig;
  onClose: () => void;
  onSaved: () => void;
}

export function AiProviderSecretDialog({
  open,
  config,
  onClose,
  onSaved,
}: AiProviderSecretDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const suggestedRef = ENV_VAR_SUGGESTIONS[config.providerType] ?? "PROVIDER_API_KEY";

  const [secretRef, setSecretRef] = useState(config.secretRef ?? suggestedRef);
  const [secretValue, setSecretValue] = useState("");
  const [errors, setErrors] = useState<{ secretRef?: string; secretValue?: string }>({});

  const validate = (): boolean => {
    const errs: { secretRef?: string; secretValue?: string } = {};
    if (!secretRef.trim()) errs.secretRef = "Required";
    if (!secretValue.trim()) errs.secretValue = "Required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const result = await saveAiProviderSecret({
        id: config.id,
        secret_value: secretValue,
        secret_ref: secretRef,
      });

      if (result.success) {
        setSecretValue("");
        onSaved();
      } else {
        toast.error(result.error ?? "Failed to save API key");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Update API Key — ${config.providerName}`}
      subtitle="The API key is never stored in the database. Only the environment variable name and a masked preview are saved."
      icon={<ShieldCheck className="h-5 w-5 text-violet-500" />}
      mode="edit"
      size="sm"
      isSubmitting={isSubmitting}
      onCancel={onClose}
      onSubmit={handleSubmit}
      submitLabel="Save Key Reference"
    >
      <div className="flex flex-col gap-4 py-2">
        {config.maskedSecretPreview && (
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            Current:{" "}
            <code className="font-mono text-xs font-semibold">{config.maskedSecretPreview}</code>
            {config.secretRef && (
              <span className="ml-2 text-muted-foreground text-xs">(env: {config.secretRef})</span>
            )}
          </div>
        )}

        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200">
          <strong>Security:</strong> The key you enter here is used only to generate the masked
          preview. The actual key must be set in your server environment as the specified environment
          variable. The key input is cleared immediately after saving.
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="secret_ref">
            Environment Variable Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="secret_ref"
            value={secretRef}
            onChange={(e) => {
              setSecretRef(e.target.value);
              setErrors((prev) => ({ ...prev, secretRef: undefined }));
            }}
            placeholder="OPENAI_API_KEY"
            className="font-mono"
          />
          {errors.secretRef && <p className="text-xs text-destructive">{errors.secretRef}</p>}
          <p className="text-xs text-muted-foreground">
            The env var name where your key is stored on the server (e.g.{" "}
            <code className="font-mono">{suggestedRef || "OPENAI_API_KEY"}</code>).
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="secret_value">
            API Key <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id="secret_value"
              type={showKey ? "text" : "password"}
              value={secretValue}
              onChange={(e) => {
                setSecretValue(e.target.value);
                setErrors((prev) => ({ ...prev, secretValue: undefined }));
              }}
              placeholder="sk-..."
              autoComplete="off"
              className="font-mono pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowKey((v) => !v)}
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.secretValue && <p className="text-xs text-destructive">{errors.secretValue}</p>}
          <p className="text-xs text-muted-foreground">
            Enter once to generate masked preview. Field is cleared after save.
          </p>
        </div>
      </div>
    </ERPChildDialogForm>
  );
}
