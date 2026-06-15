"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { getAiProvider } from "@/lib/ai/providers/factory";
import type { AiProviderConfig, AiFeatureFlag } from "@/lib/ai/providers/types";

const REVALIDATE_PATH = "/admin/settings/ai";

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const providerTypeValues = [
  "openai", "azure_openai", "azure_document_intelligence",
  "google_document_ai", "aws_textract", "tesseract",
  "local_ollama", "local_custom",
] as const;

const purposeValues = [
  "general", "chat", "ocr", "classification", "extraction",
  "embedding", "dms", "assistant",
] as const;

const createProviderSchema = z.object({
  config_code: z.string().min(1).max(100).regex(/^[A-Z0-9_]+$/, "Use uppercase letters, numbers and underscores"),
  provider_type: z.enum(providerTypeValues),
  provider_name: z.string().min(1).max(200),
  api_endpoint: z.string().url("Must be a valid URL").nullable().optional(),
  model_id: z.string().max(200).nullable().optional(),
  api_version: z.string().max(50).nullable().optional(),
  purpose: z.enum(purposeValues),
  is_default: z.boolean().default(false),
  is_enabled: z.boolean().default(false),
  is_active: z.boolean().default(true),
  requires_human_review: z.boolean().default(true),
  confidence_threshold: z.number().min(0).max(1).default(0.85),
  config_json: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const updateProviderSchema = createProviderSchema.partial().extend({
  id: z.number().int().positive(),
});

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
    if (!hasPermission(ctx, "settings.ai.view")) {
      return { success: false, error: "You do not have permission to view AI settings" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("erp_ai_provider_configs")
      .select("*")
      .is("deleted_at", null)
      .order("purpose", { ascending: true })
      .order("config_code", { ascending: true });

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data ?? []).map(mapToConfig),
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getAiProviderConfig(id: number): Promise<ActionResult<AiProviderConfig>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "settings.ai.view")) {
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
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getAiFeatureFlags(): Promise<ActionResult<AiFeatureFlag[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "settings.ai.view")) {
      return { success: false, error: "You do not have permission to view AI settings" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("erp_ai_feature_flags")
      .select("*")
      .order("feature_code", { ascending: true });

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data ?? []).map((row) => ({
        id: row.id,
        featureCode: row.feature_code,
        featureName: row.feature_name,
        description: row.description ?? null,
        isEnabled: row.is_enabled,
        requiresHumanReview: row.requires_human_review,
        minConfidenceThreshold: parseFloat(row.min_confidence_threshold ?? "0.85"),
      })),
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createAiProviderConfig(
  input: z.infer<typeof createProviderSchema>
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "settings.ai.manage")) {
      return { success: false, error: "You do not have permission to manage AI settings" };
    }

    const parsed = createProviderSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("erp_ai_provider_configs")
      .insert({
        ...parsed.data,
        config_json: parsed.data.config_json ?? null,
        notes: parsed.data.notes ?? null,
        last_test_status: "not_tested",
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_ai_provider_configs",
      entity_id: data.id,
      entity_reference: parsed.data.config_code,
      action: "create",
      new_values: { config_code: parsed.data.config_code, provider_type: parsed.data.provider_type, purpose: parsed.data.purpose },
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: data.id } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function updateAiProviderConfig(
  input: z.infer<typeof updateProviderSchema>
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "settings.ai.manage")) {
      return { success: false, error: "You do not have permission to manage AI settings" };
    }

    const parsed = updateProviderSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const { id, ...fields } = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase
      .from("erp_ai_provider_configs")
      .update({ ...fields, updated_by: ctx.profile?.id ?? null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_ai_provider_configs",
      entity_id: id,
      entity_reference: `config_id_${id}`,
      action: "update",
      new_values: fields,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deleteAiProviderConfig(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "settings.ai.manage")) {
      return { success: false, error: "You do not have permission to manage AI settings" };
    }

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("erp_ai_provider_configs")
      .select("config_code, is_default")
      .eq("id", id)
      .single();

    if (existing?.is_default) {
      return { success: false, error: "Cannot delete a default provider config. Set another provider as default first." };
    }

    const { error } = await supabase
      .from("erp_ai_provider_configs")
      .update({ deleted_at: new Date().toISOString(), updated_by: ctx.profile?.id ?? null })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_ai_provider_configs",
      entity_id: id,
      entity_reference: existing?.config_code ?? String(id),
      action: "delete",
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
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
    if (!hasPermission(ctx, "settings.ai.secrets.manage")) {
      return { success: false, error: "You do not have permission to manage AI secrets" };
    }

    const parsed = saveSecretSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const { id, secret_value, secret_ref } = parsed.data;

    // Generate masked preview: show first 4 and last 4 characters only
    const masked = maskSecret(secret_value);

    // We store only: the env var name (secret_ref) and the masked preview
    // The actual key (secret_value) is used only for validation here, never persisted
    const supabase = await createClient();
    const { error } = await supabase
      .from("erp_ai_provider_configs")
      .update({
        secret_ref,
        masked_secret_preview: masked,
        last_test_status: "not_tested",
        last_test_at: null,
        last_test_message: null,
        updated_by: ctx.profile?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_ai_provider_configs",
      entity_id: id,
      entity_reference: `secret_updated_for_${id}`,
      action: "update",
      new_values: { secret_ref, masked_preview: masked },
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function testAiProviderConnection(id: number): Promise<ActionResult<{ message: string; ok: boolean; durationMs?: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "settings.ai.test")) {
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

    // Update test status in DB
    await supabase
      .from("erp_ai_provider_configs")
      .update({
        last_test_status: testResult.ok ? "success" : "failed",
        last_test_at: new Date().toISOString(),
        last_test_message: testResult.message,
        updated_by: ctx.profile?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Log usage
    await supabase
      .from("erp_ai_usage_logs")
      .insert({
        provider_config_id: id,
        feature_area: "settings_test",
        operation_type: "test_connection",
        model_id: row.model_id ?? null,
        status: testResult.ok ? "success" : "failed",
        duration_ms: testResult.durationMs ?? null,
        error_message: testResult.ok ? null : testResult.message,
        created_by: ctx.profile?.id ?? null,
      });

    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_ai_provider_configs",
      entity_id: id,
      entity_reference: row.config_code,
      action: "update",
      new_values: { test_result: testResult.ok ? "success" : "failed", message: testResult.message },
    });

    revalidatePath(REVALIDATE_PATH);
    return {
      success: true,
      data: {
        ok: testResult.ok,
        message: testResult.message,
        durationMs: testResult.durationMs,
      },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function updateAiFeatureFlag(
  featureCode: string,
  updates: Partial<{ is_enabled: boolean; requires_human_review: boolean; min_confidence_threshold: number }>
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "settings.ai.manage")) {
      return { success: false, error: "You do not have permission to manage AI settings" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("erp_ai_feature_flags")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("feature_code", featureCode);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_ai_feature_flags",
      entity_id: 0,
      entity_reference: featureCode,
      action: "update",
      new_values: updates,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
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
    if (!hasPermission(ctx, "settings.ai.usage.view")) {
      return { success: false, error: "You do not have permission to view AI usage logs" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("erp_ai_usage_logs")
      .select(`*, erp_ai_provider_configs(provider_name)`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data ?? []).map((row) => ({
        id: row.id,
        featureArea: row.feature_area,
        operationType: row.operation_type,
        modelId: row.model_id ?? null,
        status: row.status,
        durationMs: row.duration_ms ?? null,
        estimatedCost: row.estimated_cost ? parseFloat(String(row.estimated_cost)) : null,
        errorMessage: row.error_message ?? null,
        createdAt: row.created_at,
        providerName: (row.erp_ai_provider_configs as { provider_name?: string } | null)?.provider_name ?? null,
      })),
    };
  } catch (err) {
    return { success: false, error: String(err) };
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
