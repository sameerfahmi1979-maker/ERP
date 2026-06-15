"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Key, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { saveEmailProviderSecret } from "@/server/actions/settings/email-settings";

interface EmailProviderSecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: number;
  providerName: string;
  currentMaskedPreview: string | null | undefined;
  onSuccess?: () => void;
}

export function EmailProviderSecretDialog({
  open,
  onOpenChange,
  providerId,
  providerName,
  currentMaskedPreview,
  onSuccess,
}: EmailProviderSecretDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [secretValue, setSecretValue] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const reset = () => {
    setSecretValue("");
    setShowSecret(false);
  };

  const handleClose = (v: boolean) => {
    if (!isSubmitting) { if (!v) reset(); onOpenChange(v); }
  };

  const handleSubmit = async () => {
    if (!secretValue.trim()) { toast.error("Client secret is required"); return; }

    setIsSubmitting(true);
    try {
      const result = await saveEmailProviderSecret({
        id: providerId,
        secret_value: secretValue,
      });
      if (result.success) {
        toast.success("Secret saved securely in Supabase Vault. You can now test the connection.");
        setSecretValue(""); // Always clear
        handleClose(false);
        onSuccess?.();
      } else {
        toast.error((result as { error?: string }).error ?? "Failed to save secret");
      }
    } finally {
      setIsSubmitting(false);
      setSecretValue(""); // Clear on any outcome
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleClose}
      title="Update Client Secret"
      subtitle={`Secure secret for ${providerName}`}
      icon={<Key className="h-5 w-5 text-amber-500" />}
      mode="edit"
      size="md"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      submitLabel="Save to Vault"
    >
      <div className="space-y-4">
        {/* Vault notice */}
        <div className="rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
          <div className="text-xs text-green-700 dark:text-green-400 space-y-1">
            <p className="font-semibold">Stored encrypted in Supabase Vault</p>
            <p>Your secret is AES-256 encrypted in Supabase Vault. It is never stored in a plain database column, never logged, and never returned to the browser.</p>
          </div>
        </div>

        {currentMaskedPreview && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>Current:</span>
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{currentMaskedPreview}</span>
            <span className="text-green-600 dark:text-green-400">(stored in Vault)</span>
          </div>
        )}

        <div>
          <Label htmlFor="secret-value" className="mb-1.5 block">
            Microsoft Entra App — Client Secret Value <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Input
              id="secret-value"
              type={showSecret ? "text" : "password"}
              value={secretValue}
              onChange={(e) => setSecretValue(e.target.value)}
              placeholder="Paste the client secret from Azure Entra ID here"
              autoComplete="new-password"
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle secret visibility"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Found in Azure Portal → Microsoft Entra ID → App registrations → your app → Certificates &amp; secrets.
            The value is shown only once when created.
          </p>
        </div>
      </div>
    </ERPChildDialogForm>
  );
}
