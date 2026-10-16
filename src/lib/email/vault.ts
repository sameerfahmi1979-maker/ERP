// ============================================================================
// ERP Email Provider — Supabase Vault Secret Helpers
// Phase: ERP SETTINGS.2B
//
// When the admin saves a client secret through the UI, it is encrypted and
// stored in Supabase Vault. The `secret_ref` in erp_email_provider_configs
// is set to "vault:<uuid>" to indicate Vault storage.
//
// Environment fallback is limited to approved, provider-bound references.
//
// All Vault reads use createAdminClient() (service_role) — never exposed to frontend.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";

export const VAULT_PREFIX = "vault:";

/** Returns true if the secret_ref points to Supabase Vault */
export function isVaultRef(secretRef: string | null | undefined): boolean {
  return typeof secretRef === "string" && /^vault:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secretRef);
}

export function isAllowedEmailEnvReference(ref: string, providerId?: number): boolean {
  return ref === "MICROSOFT_GRAPH_CLIENT_SECRET" ||
    (Number.isSafeInteger(providerId) && providerId! > 0 && ref === `ERP_EMAIL_PROVIDER_${providerId}_SECRET`);
}

/** Extract the raw UUID from a vault ref like "vault:<uuid>" */
function extractVaultId(secretRef: string): string {
  return secretRef.slice(VAULT_PREFIX.length);
}

/**
 * Resolve the actual secret value from either:
 *   1. Supabase Vault  (secret_ref = "vault:<uuid>")
 *   2. Environment variable  (secret_ref = "MY_ENV_VAR_NAME")
 *
 * Returns null (never throws) if the secret cannot be found.
 * Returns a descriptive error string if the reference is configured but the
 * value is missing — so callers can show a clean error to the admin.
 */
export async function resolveEmailProviderSecret(
  secretRef: string | null | undefined,
  providerId?: number
): Promise<{ secret: string | null; error: string | null }> {
  if (!secretRef) {
    return { secret: null, error: "No secret_ref configured for this provider." };
  }

  // ── Supabase Vault path ───────────────────────────────────────────────────
  if (isVaultRef(secretRef)) {
    const vaultId = extractVaultId(secretRef);
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("erp_vault_get_secret", { p_id: vaultId });
      if (error) {
        return { secret: null, error: "The protected credential could not be read. Ask an authorized administrator to review it." };
      }
      if (!data) {
        return { secret: null, error: "Secret was not found in Vault. It may have been deleted. Re-save the secret via Update Secret." };
      }
      return typeof data === "string" ? { secret: data, error: null } : { secret: null, error: "The protected credential response was invalid." };
    } catch {
      return { secret: null, error: "The protected credential could not be read." };
    }
  }

  // ── Environment variable fallback ─────────────────────────────────────────
  if (!isAllowedEmailEnvReference(secretRef, providerId)) return { secret: null, error: "This credential reference is not approved for the provider." };
  const envValue = process.env[secretRef] ?? null;
  if (!envValue) {
    return {
      secret: null,
      error: "The approved provider credential is not configured. Ask an authorized administrator to review protected settings.",
    };
  }
  return { secret: envValue, error: null };
}
