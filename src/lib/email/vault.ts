// ============================================================================
// ERP Email Provider — Supabase Vault Secret Helpers
// Phase: ERP SETTINGS.2B
//
// When the admin saves a client secret through the UI, it is encrypted and
// stored in Supabase Vault. The `secret_ref` in erp_email_provider_configs
// is set to "vault:<uuid>" to indicate Vault storage.
//
// Fallback: if secret_ref does NOT start with "vault:", it is treated as an
// environment variable name and resolved from process.env[secret_ref].
// This fallback exists for local dev overrides only.
//
// All Vault reads use createAdminClient() (service_role) — never exposed to frontend.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";

export const VAULT_PREFIX = "vault:";

/** Returns true if the secret_ref points to Supabase Vault */
export function isVaultRef(secretRef: string | null | undefined): boolean {
  return typeof secretRef === "string" && secretRef.startsWith(VAULT_PREFIX);
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
  secretRef: string | null | undefined
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
        return { secret: null, error: `Vault read error: ${error.message}` };
      }
      if (!data) {
        return { secret: null, error: "Secret was not found in Vault. It may have been deleted. Re-save the secret via Update Secret." };
      }
      return { secret: data as string, error: null };
    } catch (e) {
      return { secret: null, error: `Vault access failed: ${String(e)}` };
    }
  }

  // ── Environment variable fallback ─────────────────────────────────────────
  const envValue = process.env[secretRef] ?? null;
  if (!envValue) {
    return {
      secret: null,
      error:
        `Environment variable "${secretRef}" is not configured. ` +
        `Either set it in your environment or re-save the secret via Update Secret to store it in Supabase Vault.`,
    };
  }
  return { secret: envValue, error: null };
}

/**
 * Store (or update) an email provider secret in Supabase Vault.
 * Returns the new secret_ref string ("vault:<uuid>") to store in the DB.
 *
 * If the provider already has a vault secret (existing ref starts with "vault:"),
 * updates the existing vault entry in place (same ref UUID).
 * Otherwise creates a new vault secret.
 */
export async function storeEmailProviderSecretInVault(
  providerId: number,
  currentSecretRef: string | null | undefined,
  secretValue: string
): Promise<string> {
  const admin = createAdminClient();
  const vaultName = `erp_email_provider_${providerId}`;
  const vaultDescription = `ERP Email Provider ID ${providerId} — Microsoft Graph client secret`;

  // If there's already a vault entry for this provider, update it
  if (isVaultRef(currentSecretRef)) {
    const vaultId = extractVaultId(currentSecretRef!);
    const { error } = await admin.rpc("erp_vault_update_secret", {
      p_id: vaultId,
      p_secret: secretValue,
    });
    if (error) {
      throw new Error(`Failed to update vault secret: ${error.message}`);
    }
    return currentSecretRef!; // Same ref, same UUID
  }

  // Create a new vault secret
  const { data, error } = await admin.rpc("erp_vault_create_secret", {
    p_secret: secretValue,
    p_name: vaultName,
    p_description: vaultDescription,
  });

  if (error || !data) {
    throw new Error(`Failed to create vault secret: ${error?.message ?? "no data returned"}`);
  }

  return `${VAULT_PREFIX}${data}`;
}
