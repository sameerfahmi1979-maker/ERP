"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/rbac/check";
import { hasGlobalPermission } from "@/lib/rbac/scope";
import { recordProviderHealth } from "@/server/provider-health";
import { saveProviderMutation, saveProviderFlagMutation } from "@/server/provider-save";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import type { WorkspaceSaveResult } from "@/server/workspace-save";
import { workspaceValidationFailure } from "@/lib/workspace/field-errors";
import { aiProviderCreateSchema as createProviderSchema, aiProviderUpdateSchema as updateProviderSchema } from "@/lib/settings/provider-configuration";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { getAiProvider } from "@/lib/ai/providers/factory";
import type { AiProviderConfig, AiFeatureFlag } from "@/lib/ai/providers/types";
import { writeAiProviderSecret } from "@/lib/settings/env-file-secrets";
import { isAllowedAiSecretReference } from "@/lib/settings/ai-secret-policy";
import { createAdminClient } from "@/lib/supabase/admin";

const REVALIDATE_PATH = "/admin/settings/ai";

function refreshProviderSettings() {
  try { revalidatePath(REVALIDATE_PATH); }
  catch { /* Cache invalidation cannot undo an already confirmed result. */ }
}

function canReadProviders(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return ["settings.ai.view","settings.ai.manage","settings.ai.test","settings.ai.secrets.manage"].some(code=>hasGlobalPermission(ctx,code));
}

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const saveSecretSchema = z.object({
  id: z.number().int().positive(),
  secret_value: z.string().min(1).max(500),
  secret_ref: z.string().min(1).max(200),
});

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getAiProviderConfigs(): Promise<ActionResult<AiProviderConfig[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canReadProviders(ctx)) {
      return { success: false, error: "You do not have permission to view AI settings" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("erp_ai_provider_configs")
      .select("*")
      .is("deleted_at", null)
      .order("purpose", { ascending: true })
      .order("config_code", { ascending: true });

    if (error) return { success: false, error: "AI provider configurations could not be loaded. Try loading settings again." };

    return {
      success: true,
      data: (data ?? []).map(mapToConfig),
    };
  } catch {
    return { success: false, error: "AI provider configurations could not be loaded. Try loading settings again." };
  }
}

export async function getAiProviderConfig(id: number): Promise<ActionResult<AiProviderConfig>> {
  try {
    const ctx = await getAuthContext();
    if (!canReadProviders(ctx)) {
      return { success: false, error: "You do not have permission to view AI settings" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("erp_ai_provider_configs")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error || !data) return { success: false, error: error?.message ?? "Not found" };
    return { success: true, data: mapToConfig(data) };
  } catch {
    return { success: false, error: "Provider operation could not be confirmed. Review the current settings before retrying." };
  }
}

export async function getAiFeatureFlags(): Promise<ActionResult<AiFeatureFlag[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasGlobalPermission(ctx, "settings.ai.view") && !hasGlobalPermission(ctx, "settings.ai.manage")) {
      return { success: false, error: "You do not have permission to view AI settings" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("erp_ai_feature_flags")
      .select("*")
      .order("feature_code", { ascending: true });

    if (error) return { success: false, error: "AI feature flags could not be loaded. Try loading settings again." };

    return {
      success: true,
      data: (data ?? []).map((row) => ({
        id: row.id,
        workspaceRevision: String(row.workspace_revision),
        featureCode: row.feature_code,
        featureName: row.feature_name,
        description: row.description ?? null,
        isEnabled: row.is_enabled,
        requiresHumanReview: row.requires_human_review,
        minConfidenceThreshold: parseFloat(row.min_confidence_threshold ?? "0.85"),
      })),
    };
  } catch {
    return { success: false, error: "AI feature flags could not be loaded. Try loading settings again." };
  }
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createAiProviderConfig(input: z.input<typeof createProviderSchema>, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const ctx = await getAuthContext();
  if (!hasGlobalPermission(ctx, "settings.ai.manage")) return {success:false,error:"Global provider management permission is required."};
  const parsed = createProviderSchema.safeParse(input);
  if (!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  const result = await saveProviderMutation("ai", null, "save", parsed.data, contract);
  if (result.success) refreshProviderSettings();
  return result;
}
export async function updateAiProviderConfig(input: z.input<typeof updateProviderSchema>, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const ctx = await getAuthContext();
  if (!hasGlobalPermission(ctx, "settings.ai.manage")) return {success:false,error:"Global provider management permission is required."};
  const parsed = updateProviderSchema.safeParse(input);
  if (!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  const {id,...fields} = parsed.data;
  const result = await saveProviderMutation("ai", id, "save", fields, contract);
  if (result.success) refreshProviderSettings();
  return result;
}
export async function deleteAiProviderConfig(id: number, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const ctx = await getAuthContext();
  if (!hasGlobalPermission(ctx, "settings.ai.manage")) return {success:false,error:"Global provider management permission is required."};
  const result = await saveProviderMutation("ai", id, "archive", {}, contract);
  if (result.success) refreshProviderSettings();
  return result;
}
/**
 * Saves the API key secret reference for a provider.
 * The actual key value is NEVER stored in the DB.
 * Only the env var name (secret_ref) and a masked preview are stored.
 */
export async function saveAiProviderSecret(
  input: z.infer<typeof saveSecretSchema>
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasGlobalPermission(ctx, "settings.ai.secrets.manage")) {
      return { success: false, error: "You do not have permission to manage AI secrets" };
    }

    const parsed = saveSecretSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const { id, secret_value, secret_ref } = parsed.data;

    // Bind the approved reference to an existing active provider BEFORE side effects.
    const supabase = createAdminClient();
    const { data: provider, error: providerError } = await supabase.from("erp_ai_provider_configs")
      .select("id, provider_type, updated_at").eq("id", id).eq("is_active", true).is("deleted_at", null).maybeSingle();
    if (providerError || !provider) return { success: false, error: "Active provider not found." };
    if (!isAllowedAiSecretReference(provider.provider_type, id, secret_ref)) return { success: false, error: "Secret reference is not approved for this provider." };

    // Generate masked preview: show first 4 and last 4 characters only
    const masked = maskSecret(secret_value);

    // Persist the key to the server's .env.local (NEVER the database) and
    // apply it to the running process so it takes effect without a restart.
    const envWrite = await writeAiProviderSecret({ providerType: provider.provider_type, providerId: id, secretRef: secret_ref, secretValue: secret_value }, async () => {
      const { data, error } = await supabase.from("erp_ai_provider_configs").update({
        secret_ref, masked_secret_preview: masked, last_test_status: "not_tested",
        last_test_at: null, last_test_message: null, updated_by: ctx.profile?.id ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("provider_type", provider.provider_type).eq("updated_at", provider.updated_at)
        .eq("is_active", true).is("deleted_at", null).select("id");
      return !error && data?.length === 1;
    });
    if (!envWrite.success) {
      return {
        success: false,
        error: envWrite.error ?? "Failed to save the API key to the server environment.",
      };
    }

    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_ai_provider_configs",
      entity_id: id,
      entity_reference: `secret_updated_for_${id}`,
      action: "update",
      new_values: { secret_ref, secret_updated: true },
    });

    refreshProviderSettings();
    return { success: true };
  } catch {
    return { success: false, error: "Provider operation could not be confirmed. Review the current settings before retrying." };
  }
}

export async function testAiProviderConnection(id: number): Promise<ActionResult<{ message: string; ok: boolean; durationMs?: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasGlobalPermission(ctx, "settings.ai.test")) {
      return { success: false, error: "You do not have permission to test AI connections" };
    }

    const supabase = await createClient();
    const { data: row, error: fetchError } = await supabase
      .from("erp_ai_provider_configs")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (fetchError || !row) {
      return { success: false, error: "Provider config not found" };
    }

    const provider = await getAiProvider(row.config_code).catch(() => null);
    if (!provider) {
      return { success: false, error: "Could not create provider instance" };
    }

    const testResult = await provider.testConnection();

    if (!ctx.profile) return {success:false,error:"Not authenticated"};
    const recorded = await recordProviderHealth("ai",id,row.workspace_revision,ctx.profile.id,testResult.ok,testResult.durationMs);
    if (!recorded.success) return recorded;
    refreshProviderSettings();
    return {success:true,data:{ok:recorded.data.ok,message:recorded.data.message,durationMs:recorded.data.durationMs ?? undefined}};
  } catch {
    return { success: false, error: "Provider operation could not be confirmed. Review the current settings before retrying." };
  }
}

export async function updateAiFeatureFlag(
  featureCode: string,
  updates: Partial<{ is_enabled: boolean; requires_human_review: boolean; min_confidence_threshold: number }>,
  contract?: WorkspaceSaveContract
): Promise<WorkspaceSaveResult> {
  const ctx = await getAuthContext();
  if (!hasGlobalPermission(ctx, "settings.ai.manage"))
    return {success:false,error:"Global feature administration permission is required."};
  const schema = z.object({is_enabled:z.boolean().optional(),requires_human_review:z.boolean().optional(),min_confidence_threshold:z.number().min(0).max(1).optional()}).strict();
  const parsed = schema.safeParse(updates);
  if (!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  const result = await saveProviderFlagMutation("ai",featureCode,parsed.data,contract);
  if (result.success) refreshProviderSettings();
  return result;
}
export async function getAiUsageLogs(limit = 50): Promise<ActionResult<{
  id: number;
  featureArea: string;
  operationType: string;
  modelId: string | null;
  status: string;
  durationMs: number | null;
  estimatedCost: number | null;
  errorMessage: string | null;
  createdAt: string;
  providerName?: string | null;
}[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasGlobalPermission(ctx, "settings.ai.usage.view")) {
      return { success: false, error: "You do not have permission to view AI usage logs" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("erp_ai_usage_logs")
      .select(`*, erp_ai_provider_configs(provider_name)`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: "AI usage logs could not be loaded. Try loading settings again." };

    return {
      success: true,
      data: (data ?? []).map((row) => ({
        id: row.id,
        featureArea: row.feature_area,
        operationType: row.operation_type,
        modelId: row.model_id ?? null,
        status: row.status,
        durationMs: row.duration_ms ?? null,
        estimatedCost: row.estimated_cost == null ? null : Number(row.estimated_cost),
        errorMessage: row.error_message ?? null,
        createdAt: row.created_at,
        providerName: (row.erp_ai_provider_configs as { provider_name?: string } | null)?.provider_name ?? null,
      })),
    };
  } catch {
    return { success: false, error: "AI usage logs could not be loaded. Try loading settings again." };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function maskSecret(value: string): string {
  if (value.length <= 8) return "****";
  const prefix = value.substring(0, 4);
  const suffix = value.substring(value.length - 4);
  return `${prefix}****${suffix}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToConfig(row: Record<string, any>): AiProviderConfig {
  return {
    id: row.id,
    workspaceRevision: String(row.workspace_revision),
    configCode: row.config_code,
    providerType: row.provider_type,
    providerName: row.provider_name,
    apiEndpoint: row.api_endpoint ?? null,
    modelId: row.model_id ?? null,
    apiVersion: row.api_version ?? null,
    purpose: row.purpose,
    isDefault: row.is_default,
    isEnabled: row.is_enabled,
    isActive: row.is_active,
    requiresHumanReview: row.requires_human_review,
    confidenceThreshold: parseFloat(row.confidence_threshold ?? "0.85"),
    configJson: row.config_json ?? null,
    secretRef: row.secret_ref ?? null,
    maskedSecretPreview: row.masked_secret_preview ?? null,
    lastTestStatus: row.last_test_status ?? null,
    lastTestAt: row.last_test_at ?? null,
    lastTestMessage: row.last_test_message ?? null,
    notes: row.notes ?? null,
  };
}
