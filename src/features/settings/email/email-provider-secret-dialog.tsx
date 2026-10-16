"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Key, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { saveEmailProviderSecret, checkEmailProviderSecretSave } from "@/server/actions/settings/email-settings";

interface EmailProviderSecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: number;
  providerRevision?: string;
  providerName: string;
  currentMaskedPreview: string | null | undefined;
  onSuccess?: () => void;
}

export function EmailProviderSecretDialog(props: EmailProviderSecretDialogProps) {
  return props.open ? <EmailProviderSecretSession key={props.providerId} {...props} /> : null;
}

function EmailProviderSecretSession({
  open,
  onOpenChange,
  providerId,
  providerRevision,
  providerName,
  currentMaskedPreview,
  onSuccess,
}: EmailProviderSecretDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [secretValue, setSecretValue] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [message, setMessage] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const operation = useRef<WorkspaceSaveContract | null>(null);
  const flight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const confirmedRef = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const [displayError, setDisplayError] = useState(false);
  const router = useRouter();
  const display = (effect: () => void) => { try { effect(); } catch { if (alive.current) setDisplayError(true); } };
  const confirm = (notice: string) => {
    confirmedRef.current = true;
    setConfirmed(true);
    setUnconfirmed(false);
    setMessage("");
    setSecretValue("");
    setShowSecret(false);
    display(() => toast.success(notice));
    display(() => onOpenChange(false));
    display(() => onSuccess?.());
  };

  const reset = () => {
    setSecretValue("");
    setShowSecret(false);
  };

  const handleClose = (v: boolean) => {
    if (!isSubmitting) { if (!v) reset(); display(() => onOpenChange(v)); }
  };

  const handleSubmit = async () => {
    if (flight.current || unconfirmed || confirmedRef.current) return;
    if (!providerRevision) { setMessage("Reopen the provider to load its current revision before saving a credential."); return; }
    if (!secretValue.trim()) { toast.error("Client secret is required"); return; }
    flight.current = true;
    operation.current = {operationId:crypto.randomUUID(),revision:providerRevision};
    setMessage("");
    setIsSubmitting(true);
    try {
      const result = await saveEmailProviderSecret({
        id: providerId,
        secret_value: secretValue,
      }, operation.current);
      if (!alive.current) return;
      if (result.success) {
        confirm(result.data?.changed === false ? "No credential changes to save." : "Secret and provider configuration saved together. You can now test the connection.");
      } else {
        setUnconfirmed(result.uncertain === true);
        setMessage(result.error ?? "Credential save could not be confirmed.");
      }
    } catch {
      if (alive.current) { setUnconfirmed(true);setMessage("Credential save unconfirmed. Check the save result before entering another secret."); }
    } finally {
      flight.current = false;
      if (alive.current) { setIsSubmitting(false);setSecretValue("");setShowSecret(false); } // Clear on any outcome
    }
  };

  const checkResult = async () => {
    if (flight.current || confirmedRef.current || !unconfirmed || !operation.current) return;
    flight.current = true;setIsSubmitting(true);
    try {
      const result = await checkEmailProviderSecretSave(providerId,operation.current);
      if (!alive.current) return;
      if (result.success) { confirm("The earlier credential save is confirmed. Settings will refresh."); }
      else setMessage(result.uncertain ? result.error ?? "Save status is unavailable. Do not enter another secret until it is reconciled." : "The earlier credential save is still unconfirmed. Retry this check; it does not submit a secret.");
    } catch { if (alive.current) setMessage("Save status is unavailable. Retry this check; it does not submit a secret."); }
    finally {flight.current=false;if (alive.current) setIsSubmitting(false);}
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
      submitDisabled={confirmed || unconfirmed || !providerRevision}
      isDirty={secretValue.length > 0}
      onSubmit={handleSubmit}
      submitLabel="Save to Vault"
    >
      <div className="space-y-4">
        {confirmed && <div role="status" className="space-y-2"><p>Credential save confirmed.</p>{displayError && <p>The display could not finish updating. The credential save remains confirmed.</p>}<Button type="button" variant="outline" onClick={() => display(() => router.refresh())}>Refresh settings only</Button></div>}
        {message && <div role="alert" className="space-y-2"><p>{message}</p>{unconfirmed && <Button type="button" variant="outline" disabled={isSubmitting} onClick={()=>void checkResult()}>Check save result</Button>}</div>}
        {/* Vault notice */}
        <div className="rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
          <div className="text-xs text-green-700 dark:text-green-400 space-y-1">
            <p className="font-semibold">Stored encrypted in Supabase Vault</p>
            <p>Your secret is encrypted in Supabase Vault. The credential, provider revision and audit update are saved together. The saved secret is not returned to this form.</p>
          </div>
        </div>

        {currentMaskedPreview && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>Current:</span>
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{currentMaskedPreview}</span>
            <span className="text-green-600 dark:text-green-400">(protected credential configured)</span>
          </div>
        )}

        <div>
          <Label htmlFor="secret-value" className="mb-1.5 block">
            Microsoft Entra App — Client Secret Value <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Input
              required aria-label="Client secret"
              id="secret-value"
              type={showSecret ? "text" : "password"}
              value={secretValue}
              disabled={confirmed || unconfirmed || isSubmitting}
              maxLength={500}
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
          <p className="text-xs text-muted-foreground mt-1">For privacy, this value is cleared after every attempt and when this dialog closes. If a save cannot be confirmed, verify the provider before entering it again.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Found in Azure Portal → Microsoft Entra ID → App registrations → your app → Certificates &amp; secrets.
            The value is shown only once when created.
          </p>
        </div>
      </div>
    </ERPChildDialogForm>
  );
}
