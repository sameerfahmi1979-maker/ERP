"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";
import {
  createCurrencySchema,
  updateCurrencySchema,
  createPaymentTermSchema,
  updatePaymentTermSchema,
  createTaxTypeSchema,
  updateTaxTypeSchema,
  createBankSchema,
  updateBankSchema,
  createCostCenterSchema,
  updateCostCenterSchema,
  createProfitCenterSchema,
  updateProfitCenterSchema,
  toggleFinanceBasicsStatusSchema,
  type CreateCurrencyInput,
  type UpdateCurrencyInput,
  type CreatePaymentTermInput,
  type UpdatePaymentTermInput,
  type CreateTaxTypeInput,
  type UpdateTaxTypeInput,
  type CreateBankInput,
  type UpdateBankInput,
  type CreateCostCenterInput,
  type UpdateCostCenterInput,
  type CreateProfitCenterInput,
  type UpdateProfitCenterInput,
  type ToggleFinanceBasicsStatusInput,
} from "./validation";
import type {
  Currency,
  PaymentTerm,
  TaxType,
  BankWithCountry,
  CostCenterWithRelations,
  ProfitCenterWithRelations,
  FinanceBasicsSelectOption,
  CurrencyFilters,
  PaymentTermFilters,
  TaxTypeFilters,
  BankFilters,
  CostCenterFilters,
  ProfitCenterFilters,
} from "./types";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

const FINANCE_BASICS_PATHS = [
  "/admin/master-data/finance-basics/currencies",
  "/admin/master-data/finance-basics/payment-terms",
  "/admin/master-data/finance-basics/tax-types",
  "/admin/master-data/finance-basics/banks",
  "/admin/master-data/finance-basics/cost-centers",
  "/admin/master-data/finance-basics/profit-centers",
] as const;

function revalidateFinanceBasicsPages() {
  FINANCE_BASICS_PATHS.forEach((path) => revalidatePath(path));
}

function formatValidationErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): string {
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

function isSystemAdmin(roleCodes: string[] | undefined): boolean {
  return roleCodes?.includes("system_admin") ?? false;
}

function lockedRecordError<T>(): ActionResult<T> {
  return { success: false, error: "This record is locked and cannot be modified" };
}

function managePermissionError<T>(): ActionResult<T> {
  return { success: false, error: "You do not have permission to manage finance basics master data" };
}

function viewPermissionError<T>(): ActionResult<T> {
  return { success: false, error: "You do not have permission to view finance basics data" };
}

function nullifyEmpty(value: string | null | undefined): string | null | undefined {
  if (value === "") return null;
  return value;
}

// ============================================================================
// CURRENCIES
// ============================================================================

export async function createCurrency(
  input: CreateCurrencyInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = createCurrencySchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const dataToInsert = {
      ...validated,
      currency_name_ar: validated.currency_name_ar || null,
      symbol: validated.symbol || null,
      description_en: validated.description_en || null,
      description_ar: validated.description_ar || null,
      notes: validated.notes || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("currencies")
      .insert(dataToInsert)
      .select("id, currency_code")
      .single();

    if (error) {
      console.error("createCurrency error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "currencies",
      entity_id: data.id,
      entity_reference: data.currency_code,
      action: "create",
      new_values: validated,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createCurrency exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateCurrency(
  input: UpdateCurrencyInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = updateCurrencySchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const { id, ...updates } = validated;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("currencies").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Currency not found" };
    }

    if (oldData.is_locked && !isSystemAdmin(ctx.roleCodes)) {
      return lockedRecordError();
    }

    const dataToUpdate = {
      ...updates,
      currency_name_ar: nullifyEmpty(updates.currency_name_ar),
      symbol: nullifyEmpty(updates.symbol),
      description_en: nullifyEmpty(updates.description_en),
      description_ar: nullifyEmpty(updates.description_ar),
      notes: nullifyEmpty(updates.notes),
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase.from("currencies").update(dataToUpdate).eq("id", id);
    if (error) {
      console.error("updateCurrency error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    await logAudit({
      module_code: "master_data",
      entity_name: "currencies",
      entity_id: id,
      entity_reference: oldData.currency_code,
      action: "update",
      old_values,
      new_values,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateCurrency exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function toggleCurrencyStatus(
  input: ToggleFinanceBasicsStatusInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = toggleFinanceBasicsStatusSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const { id, is_active, deactivation_reason } = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("currencies").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Currency not found" };
    }

    const dataToUpdate = {
      is_active,
      deactivated_at: is_active ? null : new Date().toISOString(),
      deactivated_by: is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: is_active ? null : deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase.from("currencies").update(dataToUpdate).eq("id", id);
    if (error) {
      console.error("toggleCurrencyStatus error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    await logAudit({
      module_code: "master_data",
      entity_name: "currencies",
      entity_id: id,
      entity_reference: oldData.currency_code,
      action: is_active ? "activate" : "deactivate",
      old_values,
      new_values,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("toggleCurrencyStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getCurrencies(
  filters?: CurrencyFilters,
): Promise<ActionResult<Currency[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    let query = supabase
      .from("currencies")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("currency_name_en", { ascending: true });

    if (filters?.search) {
      query = query.or(
        `currency_code.ilike.%${filters.search}%,currency_name_en.ilike.%${filters.search}%,currency_name_ar.ilike.%${filters.search}%`,
      );
    }
    if (filters?.is_base_currency !== undefined) {
      query = query.eq("is_base_currency", filters.is_base_currency);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq("is_active", filters.is_active);
    }
    if (filters?.is_system !== undefined) {
      query = query.eq("is_system", filters.is_system);
    }
    if (filters?.is_locked !== undefined) {
      query = query.eq("is_locked", filters.is_locked);
    }

    const { data, error } = await query;
    if (error) {
      console.error("getCurrencies error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("getCurrencies exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getCurrencyById(id: number): Promise<ActionResult<Currency>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("currencies").select("*").eq("id", id).single();
    if (error) {
      console.error("getCurrencyById error", error);
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: "Currency not found" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getCurrencyById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteCurrency(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes)) {
      return { success: false, error: "Only system administrators can delete finance basics records. Use deactivate instead." };
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("currencies").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Currency not found" };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "currencies",
      entity_id: id,
      entity_reference: oldData.currency_code,
      action: "delete",
      old_values: oldData,
    });

    const { error } = await supabase.from("currencies").delete().eq("id", id);
    if (error) {
      console.error("deleteCurrency error", error);
      return {
        success: false,
        error: error.message.includes("foreign key")
          ? "Cannot delete currency with related records. Deactivate instead."
          : error.message,
      };
    }

    revalidateFinanceBasicsPages();
    return { success: true };
  } catch (error) {
    console.error("deleteCurrency exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function toggleCurrencyLock(
  id: number,
  is_locked: boolean,
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes) && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Lock permission required" };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("currencies")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Currency not found" };
    }

    const { error: updateError } = await supabase
      .from("currencies")
      .update({ is_locked, updated_by: ctx.profile.id })
      .eq("id", id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "currencies",
      entity_id: id,
      entity_reference: existing.currency_code,
      action: is_locked ? "currency.lock" : "currency.unlock",
      old_values: { is_locked: existing.is_locked },
      new_values: { is_locked },
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    revalidateFinanceBasicsPages();
    return { success: true };
  } catch (error) {
    console.error("toggleCurrencyLock exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getActiveCurrenciesForSelect(): Promise<ActionResult<FinanceBasicsSelectOption[]>> {
  try {
    await getAuthContext();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("currencies")
      .select("id, currency_code, currency_name_en, currency_name_ar, is_system, is_locked")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("currency_name_en", { ascending: true });

    if (error) {
      console.error("getActiveCurrenciesForSelect error", error);
      return { success: false, error: error.message };
    }

    const options: FinanceBasicsSelectOption[] = (data || []).map((row) => ({
      value: row.id,
      label: row.currency_name_en,
      code: row.currency_code,
      is_system: row.is_system,
      is_locked: row.is_locked,
    }));

    return { success: true, data: options };
  } catch (error) {
    console.error("getActiveCurrenciesForSelect exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// PAYMENT TERMS
// ============================================================================

export async function createPaymentTerm(
  input: CreatePaymentTermInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = createPaymentTermSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const dataToInsert = {
      ...validated,
      term_name_ar: validated.term_name_ar || null,
      calculation_notes: validated.calculation_notes || null,
      description_en: validated.description_en || null,
      description_ar: validated.description_ar || null,
      notes: validated.notes || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("payment_terms")
      .insert(dataToInsert)
      .select("id, term_code")
      .single();

    if (error) {
      console.error("createPaymentTerm error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "payment_terms",
      entity_id: data.id,
      entity_reference: data.term_code,
      action: "create",
      new_values: validated,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createPaymentTerm exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updatePaymentTerm(
  input: UpdatePaymentTermInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = updatePaymentTermSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const { id, ...updates } = validated;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("payment_terms").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Payment term not found" };
    }

    if (oldData.is_locked && !isSystemAdmin(ctx.roleCodes)) {
      return lockedRecordError();
    }

    const dataToUpdate = {
      ...updates,
      term_name_ar: nullifyEmpty(updates.term_name_ar),
      calculation_notes: nullifyEmpty(updates.calculation_notes),
      description_en: nullifyEmpty(updates.description_en),
      description_ar: nullifyEmpty(updates.description_ar),
      notes: nullifyEmpty(updates.notes),
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase.from("payment_terms").update(dataToUpdate).eq("id", id);
    if (error) {
      console.error("updatePaymentTerm error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    await logAudit({
      module_code: "master_data",
      entity_name: "payment_terms",
      entity_id: id,
      entity_reference: oldData.term_code,
      action: "update",
      old_values,
      new_values,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("updatePaymentTerm exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function togglePaymentTermStatus(
  input: ToggleFinanceBasicsStatusInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = toggleFinanceBasicsStatusSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const { id, is_active, deactivation_reason } = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("payment_terms").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Payment term not found" };
    }

    const dataToUpdate = {
      is_active,
      deactivated_at: is_active ? null : new Date().toISOString(),
      deactivated_by: is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: is_active ? null : deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase.from("payment_terms").update(dataToUpdate).eq("id", id);
    if (error) {
      console.error("togglePaymentTermStatus error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    await logAudit({
      module_code: "master_data",
      entity_name: "payment_terms",
      entity_id: id,
      entity_reference: oldData.term_code,
      action: is_active ? "activate" : "deactivate",
      old_values,
      new_values,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("togglePaymentTermStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getPaymentTerms(
  filters?: PaymentTermFilters,
): Promise<ActionResult<PaymentTerm[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    let query = supabase
      .from("payment_terms")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("term_name_en", { ascending: true });

    if (filters?.search) {
      query = query.or(
        `term_code.ilike.%${filters.search}%,term_name_en.ilike.%${filters.search}%,term_name_ar.ilike.%${filters.search}%`,
      );
    }
    if (filters?.is_active !== undefined) {
      query = query.eq("is_active", filters.is_active);
    }
    if (filters?.is_system !== undefined) {
      query = query.eq("is_system", filters.is_system);
    }
    if (filters?.is_locked !== undefined) {
      query = query.eq("is_locked", filters.is_locked);
    }

    const { data, error } = await query;
    if (error) {
      console.error("getPaymentTerms error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("getPaymentTerms exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getPaymentTermById(id: number): Promise<ActionResult<PaymentTerm>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("payment_terms").select("*").eq("id", id).single();
    if (error) {
      console.error("getPaymentTermById error", error);
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: "Payment term not found" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getPaymentTermById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deletePaymentTerm(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes)) {
      return { success: false, error: "Only system administrators can delete finance basics records. Use deactivate instead." };
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("payment_terms").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Payment term not found" };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "payment_terms",
      entity_id: id,
      entity_reference: oldData.term_code,
      action: "delete",
      old_values: oldData,
    });

    const { error } = await supabase.from("payment_terms").delete().eq("id", id);
    if (error) {
      console.error("deletePaymentTerm error", error);
      return {
        success: false,
        error: error.message.includes("foreign key")
          ? "Cannot delete payment term with related records. Deactivate instead."
          : error.message,
      };
    }

    revalidateFinanceBasicsPages();
    return { success: true };
  } catch (error) {
    console.error("deletePaymentTerm exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function togglePaymentTermLock(
  id: number,
  is_locked: boolean,
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes) && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Lock permission required" };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("payment_terms")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Payment term not found" };
    }

    const { error: updateError } = await supabase
      .from("payment_terms")
      .update({ is_locked, updated_by: ctx.profile.id })
      .eq("id", id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "payment_terms",
      entity_id: id,
      entity_reference: existing.term_code,
      action: is_locked ? "payment_term.lock" : "payment_term.unlock",
      old_values: { is_locked: existing.is_locked },
      new_values: { is_locked },
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    revalidateFinanceBasicsPages();
    return { success: true };
  } catch (error) {
    console.error("togglePaymentTermLock exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getActivePaymentTermsForSelect(): Promise<ActionResult<FinanceBasicsSelectOption[]>> {
  try {
    await getAuthContext();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("payment_terms")
      .select("id, term_code, term_name_en, is_system, is_locked")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("term_name_en", { ascending: true });

    if (error) {
      console.error("getActivePaymentTermsForSelect error", error);
      return { success: false, error: error.message };
    }

    const options: FinanceBasicsSelectOption[] = (data || []).map((row) => ({
      value: row.id,
      label: row.term_name_en,
      code: row.term_code,
      is_system: row.is_system,
      is_locked: row.is_locked,
    }));

    return { success: true, data: options };
  } catch (error) {
    console.error("getActivePaymentTermsForSelect exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// TAX TYPES
// ============================================================================

export async function createTaxType(
  input: CreateTaxTypeInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = createTaxTypeSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const dataToInsert = {
      ...validated,
      tax_name_ar: validated.tax_name_ar || null,
      effective_to: validated.effective_to || null,
      description_en: validated.description_en || null,
      description_ar: validated.description_ar || null,
      notes: validated.notes || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("tax_types")
      .insert(dataToInsert)
      .select("id, tax_code")
      .single();

    if (error) {
      console.error("createTaxType error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "tax_types",
      entity_id: data.id,
      entity_reference: data.tax_code,
      action: "create",
      new_values: validated,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createTaxType exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateTaxType(
  input: UpdateTaxTypeInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = updateTaxTypeSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const { id, ...updates } = validated;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("tax_types").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Tax type not found" };
    }

    if (oldData.is_locked && !isSystemAdmin(ctx.roleCodes)) {
      return lockedRecordError();
    }

    const dataToUpdate = {
      ...updates,
      tax_name_ar: nullifyEmpty(updates.tax_name_ar),
      effective_to: nullifyEmpty(updates.effective_to),
      description_en: nullifyEmpty(updates.description_en),
      description_ar: nullifyEmpty(updates.description_ar),
      notes: nullifyEmpty(updates.notes),
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase.from("tax_types").update(dataToUpdate).eq("id", id);
    if (error) {
      console.error("updateTaxType error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    await logAudit({
      module_code: "master_data",
      entity_name: "tax_types",
      entity_id: id,
      entity_reference: oldData.tax_code,
      action: "update",
      old_values,
      new_values,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateTaxType exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function toggleTaxTypeStatus(
  input: ToggleFinanceBasicsStatusInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = toggleFinanceBasicsStatusSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const { id, is_active, deactivation_reason } = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("tax_types").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Tax type not found" };
    }

    const dataToUpdate = {
      is_active,
      deactivated_at: is_active ? null : new Date().toISOString(),
      deactivated_by: is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: is_active ? null : deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase.from("tax_types").update(dataToUpdate).eq("id", id);
    if (error) {
      console.error("toggleTaxTypeStatus error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    await logAudit({
      module_code: "master_data",
      entity_name: "tax_types",
      entity_id: id,
      entity_reference: oldData.tax_code,
      action: is_active ? "activate" : "deactivate",
      old_values,
      new_values,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("toggleTaxTypeStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getTaxTypes(
  filters?: TaxTypeFilters,
): Promise<ActionResult<TaxType[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    let query = supabase
      .from("tax_types")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("tax_name_en", { ascending: true });

    if (filters?.search) {
      query = query.or(
        `tax_code.ilike.%${filters.search}%,tax_name_en.ilike.%${filters.search}%,tax_name_ar.ilike.%${filters.search}%`,
      );
    }
    if (filters?.tax_treatment_code) {
      query = query.eq("tax_treatment_code", filters.tax_treatment_code);
    }
    if (filters?.is_vat !== undefined) {
      query = query.eq("is_vat", filters.is_vat);
    }
    if (filters?.is_reverse_charge !== undefined) {
      query = query.eq("is_reverse_charge", filters.is_reverse_charge);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq("is_active", filters.is_active);
    }
    if (filters?.is_system !== undefined) {
      query = query.eq("is_system", filters.is_system);
    }
    if (filters?.is_locked !== undefined) {
      query = query.eq("is_locked", filters.is_locked);
    }

    const { data, error } = await query;
    if (error) {
      console.error("getTaxTypes error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("getTaxTypes exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getTaxTypeById(id: number): Promise<ActionResult<TaxType>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("tax_types").select("*").eq("id", id).single();
    if (error) {
      console.error("getTaxTypeById error", error);
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: "Tax type not found" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getTaxTypeById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteTaxType(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes)) {
      return { success: false, error: "Only system administrators can delete finance basics records. Use deactivate instead." };
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("tax_types").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Tax type not found" };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "tax_types",
      entity_id: id,
      entity_reference: oldData.tax_code,
      action: "delete",
      old_values: oldData,
    });

    const { error } = await supabase.from("tax_types").delete().eq("id", id);
    if (error) {
      console.error("deleteTaxType error", error);
      return {
        success: false,
        error: error.message.includes("foreign key")
          ? "Cannot delete tax type with related records. Deactivate instead."
          : error.message,
      };
    }

    revalidateFinanceBasicsPages();
    return { success: true };
  } catch (error) {
    console.error("deleteTaxType exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function toggleTaxTypeLock(
  id: number,
  is_locked: boolean,
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes) && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Lock permission required" };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("tax_types")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Tax type not found" };
    }

    const { error: updateError } = await supabase
      .from("tax_types")
      .update({ is_locked, updated_by: ctx.profile.id })
      .eq("id", id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "tax_types",
      entity_id: id,
      entity_reference: existing.tax_code,
      action: is_locked ? "tax_type.lock" : "tax_type.unlock",
      old_values: { is_locked: existing.is_locked },
      new_values: { is_locked },
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    revalidateFinanceBasicsPages();
    return { success: true };
  } catch (error) {
    console.error("toggleTaxTypeLock exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getActiveTaxTypesForSelect(): Promise<ActionResult<FinanceBasicsSelectOption[]>> {
  try {
    await getAuthContext();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tax_types")
      .select("id, tax_code, tax_name_en, is_system, is_locked")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("tax_name_en", { ascending: true });

    if (error) {
      console.error("getActiveTaxTypesForSelect error", error);
      return { success: false, error: error.message };
    }

    const options: FinanceBasicsSelectOption[] = (data || []).map((row) => ({
      value: row.id,
      label: row.tax_name_en,
      code: row.tax_code,
      is_system: row.is_system,
      is_locked: row.is_locked,
    }));

    return { success: true, data: options };
  } catch (error) {
    console.error("getActiveTaxTypesForSelect exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// BANKS
// ============================================================================

export async function createBank(
  input: CreateBankInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = createBankSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const dataToInsert = {
      ...validated,
      bank_name_ar: validated.bank_name_ar || null,
      short_name: validated.short_name || null,
      country_id: validated.country_id ?? null,
      bank_type_code: validated.bank_type_code || null,
      swift_code: validated.swift_code || null,
      website_url: validated.website_url || null,
      contact_phone: validated.contact_phone || null,
      contact_email: validated.contact_email || null,
      description_en: validated.description_en || null,
      description_ar: validated.description_ar || null,
      notes: validated.notes || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("banks")
      .insert(dataToInsert)
      .select("id, bank_code")
      .single();

    if (error) {
      console.error("createBank error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "banks",
      entity_id: data.id,
      entity_reference: data.bank_code,
      action: "create",
      new_values: validated,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createBank exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateBank(
  input: UpdateBankInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = updateBankSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const { id, ...updates } = validated;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("banks").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Bank not found" };
    }

    if (oldData.is_locked && !isSystemAdmin(ctx.roleCodes)) {
      return lockedRecordError();
    }

    const dataToUpdate = {
      ...updates,
      bank_name_ar: nullifyEmpty(updates.bank_name_ar),
      short_name: nullifyEmpty(updates.short_name),
      bank_type_code: nullifyEmpty(updates.bank_type_code),
      swift_code: nullifyEmpty(updates.swift_code),
      website_url: nullifyEmpty(updates.website_url),
      contact_phone: nullifyEmpty(updates.contact_phone),
      contact_email: nullifyEmpty(updates.contact_email),
      description_en: nullifyEmpty(updates.description_en),
      description_ar: nullifyEmpty(updates.description_ar),
      notes: nullifyEmpty(updates.notes),
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase.from("banks").update(dataToUpdate).eq("id", id);
    if (error) {
      console.error("updateBank error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    await logAudit({
      module_code: "master_data",
      entity_name: "banks",
      entity_id: id,
      entity_reference: oldData.bank_code,
      action: "update",
      old_values,
      new_values,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateBank exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function toggleBankStatus(
  input: ToggleFinanceBasicsStatusInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = toggleFinanceBasicsStatusSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const { id, is_active, deactivation_reason } = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("banks").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Bank not found" };
    }

    const dataToUpdate = {
      is_active,
      deactivated_at: is_active ? null : new Date().toISOString(),
      deactivated_by: is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: is_active ? null : deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase.from("banks").update(dataToUpdate).eq("id", id);
    if (error) {
      console.error("toggleBankStatus error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    await logAudit({
      module_code: "master_data",
      entity_name: "banks",
      entity_id: id,
      entity_reference: oldData.bank_code,
      action: is_active ? "activate" : "deactivate",
      old_values,
      new_values,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("toggleBankStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getBanks(
  filters?: BankFilters,
): Promise<ActionResult<BankWithCountry[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    let query = supabase
      .from("banks")
      .select("*, country:countries(country_code, name_en, name_ar)")
      .order("sort_order", { ascending: true })
      .order("bank_name_en", { ascending: true });

    if (filters?.search) {
      query = query.or(
        `bank_code.ilike.%${filters.search}%,bank_name_en.ilike.%${filters.search}%,bank_name_ar.ilike.%${filters.search}%,swift_code.ilike.%${filters.search}%`,
      );
    }
    if (filters?.country_id) {
      query = query.eq("country_id", filters.country_id);
    }
    if (filters?.bank_type_code) {
      query = query.eq("bank_type_code", filters.bank_type_code);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq("is_active", filters.is_active);
    }
    if (filters?.is_system !== undefined) {
      query = query.eq("is_system", filters.is_system);
    }
    if (filters?.is_locked !== undefined) {
      query = query.eq("is_locked", filters.is_locked);
    }

    const { data, error } = await query;
    if (error) {
      console.error("getBanks error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("getBanks exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getBankById(id: number): Promise<ActionResult<BankWithCountry>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("banks")
      .select("*, country:countries(country_code, name_en, name_ar)")
      .eq("id", id)
      .single();

    if (error) {
      console.error("getBankById error", error);
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: "Bank not found" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getBankById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteBank(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes)) {
      return { success: false, error: "Only system administrators can delete finance basics records. Use deactivate instead." };
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("banks").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Bank not found" };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "banks",
      entity_id: id,
      entity_reference: oldData.bank_code,
      action: "delete",
      old_values: oldData,
    });

    const { error } = await supabase.from("banks").delete().eq("id", id);
    if (error) {
      console.error("deleteBank error", error);
      return {
        success: false,
        error: error.message.includes("foreign key")
          ? "Cannot delete bank with related records. Deactivate instead."
          : error.message,
      };
    }

    revalidateFinanceBasicsPages();
    return { success: true };
  } catch (error) {
    console.error("deleteBank exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function toggleBankLock(
  id: number,
  is_locked: boolean,
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes) && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Lock permission required" };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("banks")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Bank not found" };
    }

    const { error: updateError } = await supabase
      .from("banks")
      .update({ is_locked, updated_by: ctx.profile.id })
      .eq("id", id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "banks",
      entity_id: id,
      entity_reference: existing.bank_code,
      action: is_locked ? "bank.lock" : "bank.unlock",
      old_values: { is_locked: existing.is_locked },
      new_values: { is_locked },
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    revalidateFinanceBasicsPages();
    return { success: true };
  } catch (error) {
    console.error("toggleBankLock exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getActiveBanksForSelect(
  filters?: { countryId?: number; bankTypeCode?: string },
): Promise<ActionResult<FinanceBasicsSelectOption[]>> {
  try {
    await getAuthContext();
    const supabase = await createClient();
    let query = supabase
      .from("banks")
      .select("id, bank_code, bank_name_en, country_id, is_system, is_locked")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("bank_name_en", { ascending: true });

    if (filters?.countryId) {
      query = query.eq("country_id", filters.countryId);
    }
    if (filters?.bankTypeCode) {
      query = query.eq("bank_type_code", filters.bankTypeCode);
    }

    const { data, error } = await query;
    if (error) {
      console.error("getActiveBanksForSelect error", error);
      return { success: false, error: error.message };
    }

    const options: FinanceBasicsSelectOption[] = (data || []).map((row) => ({
      value: row.id,
      label: row.bank_name_en,
      code: row.bank_code,
      parent_id: row.country_id,
      is_system: row.is_system,
      is_locked: row.is_locked,
    }));

    return { success: true, data: options };
  } catch (error) {
    console.error("getActiveBanksForSelect exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// COST CENTERS
// ============================================================================

const COST_CENTER_RELATIONS_SELECT =
  "*, parent:cost_centers!parent_cost_center_id(cost_center_code, cost_center_name_en, cost_center_name_ar), owner_company:owner_companies(company_code, legal_name_en), branch:branches(branch_code, branch_name_en, branch_name_ar)";

export async function createCostCenter(
  input: CreateCostCenterInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = createCostCenterSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const dataToInsert = {
      ...validated,
      cost_center_name_ar: validated.cost_center_name_ar || null,
      cost_center_type_code: validated.cost_center_type_code || null,
      parent_cost_center_id: validated.parent_cost_center_id ?? null,
      owner_company_id: validated.owner_company_id ?? null,
      branch_id: validated.branch_id ?? null,
      description_en: validated.description_en || null,
      description_ar: validated.description_ar || null,
      notes: validated.notes || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("cost_centers")
      .insert(dataToInsert)
      .select("id, cost_center_code")
      .single();

    if (error) {
      console.error("createCostCenter error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "cost_centers",
      entity_id: data.id,
      entity_reference: data.cost_center_code,
      action: "create",
      new_values: validated,
      owner_company_id: validated.owner_company_id ?? undefined,
      branch_id: validated.branch_id ?? undefined,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createCostCenter exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateCostCenter(
  input: UpdateCostCenterInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = updateCostCenterSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const { id, ...updates } = validated;
    if (updates.parent_cost_center_id === id) {
      return { success: false, error: "Cost center cannot be its own parent" };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("cost_centers").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Cost center not found" };
    }

    if (oldData.is_locked && !isSystemAdmin(ctx.roleCodes)) {
      return lockedRecordError();
    }

    const dataToUpdate = {
      ...updates,
      cost_center_name_ar: nullifyEmpty(updates.cost_center_name_ar),
      cost_center_type_code: nullifyEmpty(updates.cost_center_type_code),
      description_en: nullifyEmpty(updates.description_en),
      description_ar: nullifyEmpty(updates.description_ar),
      notes: nullifyEmpty(updates.notes),
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase.from("cost_centers").update(dataToUpdate).eq("id", id);
    if (error) {
      console.error("updateCostCenter error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    await logAudit({
      module_code: "master_data",
      entity_name: "cost_centers",
      entity_id: id,
      entity_reference: oldData.cost_center_code,
      action: "update",
      old_values,
      new_values,
      owner_company_id: oldData.owner_company_id ?? undefined,
      branch_id: oldData.branch_id ?? undefined,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateCostCenter exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function toggleCostCenterStatus(
  input: ToggleFinanceBasicsStatusInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = toggleFinanceBasicsStatusSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const { id, is_active, deactivation_reason } = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("cost_centers").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Cost center not found" };
    }

    const dataToUpdate = {
      is_active,
      deactivated_at: is_active ? null : new Date().toISOString(),
      deactivated_by: is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: is_active ? null : deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase.from("cost_centers").update(dataToUpdate).eq("id", id);
    if (error) {
      console.error("toggleCostCenterStatus error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    await logAudit({
      module_code: "master_data",
      entity_name: "cost_centers",
      entity_id: id,
      entity_reference: oldData.cost_center_code,
      action: is_active ? "activate" : "deactivate",
      old_values,
      new_values,
      owner_company_id: oldData.owner_company_id ?? undefined,
      branch_id: oldData.branch_id ?? undefined,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("toggleCostCenterStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getCostCenters(
  filters?: CostCenterFilters,
): Promise<ActionResult<CostCenterWithRelations[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    let query = supabase
      .from("cost_centers")
      .select(COST_CENTER_RELATIONS_SELECT)
      .order("sort_order", { ascending: true })
      .order("cost_center_name_en", { ascending: true });

    if (filters?.search) {
      query = query.or(
        `cost_center_code.ilike.%${filters.search}%,cost_center_name_en.ilike.%${filters.search}%,cost_center_name_ar.ilike.%${filters.search}%`,
      );
    }
    if (filters?.owner_company_id) {
      query = query.eq("owner_company_id", filters.owner_company_id);
    }
    if (filters?.branch_id) {
      query = query.eq("branch_id", filters.branch_id);
    }
    if (filters?.parent_cost_center_id) {
      query = query.eq("parent_cost_center_id", filters.parent_cost_center_id);
    }
    if (filters?.cost_center_type_code) {
      query = query.eq("cost_center_type_code", filters.cost_center_type_code);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq("is_active", filters.is_active);
    }
    if (filters?.is_system !== undefined) {
      query = query.eq("is_system", filters.is_system);
    }
    if (filters?.is_locked !== undefined) {
      query = query.eq("is_locked", filters.is_locked);
    }

    const { data, error } = await query;
    if (error) {
      console.error("getCostCenters error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("getCostCenters exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getCostCenterById(
  id: number,
): Promise<ActionResult<CostCenterWithRelations>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cost_centers")
      .select(COST_CENTER_RELATIONS_SELECT)
      .eq("id", id)
      .single();

    if (error) {
      console.error("getCostCenterById error", error);
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: "Cost center not found" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getCostCenterById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteCostCenter(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes)) {
      return { success: false, error: "Only system administrators can delete finance basics records. Use deactivate instead." };
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("cost_centers").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Cost center not found" };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "cost_centers",
      entity_id: id,
      entity_reference: oldData.cost_center_code,
      action: "delete",
      old_values: oldData,
      owner_company_id: oldData.owner_company_id ?? undefined,
      branch_id: oldData.branch_id ?? undefined,
    });

    const { error } = await supabase.from("cost_centers").delete().eq("id", id);
    if (error) {
      console.error("deleteCostCenter error", error);
      return {
        success: false,
        error: error.message.includes("foreign key")
          ? "Cannot delete cost center with related records (child centers, allocations, etc.). Deactivate instead."
          : error.message,
      };
    }

    revalidateFinanceBasicsPages();
    return { success: true };
  } catch (error) {
    console.error("deleteCostCenter exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function toggleCostCenterLock(
  id: number,
  is_locked: boolean,
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes) && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Lock permission required" };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("cost_centers")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Cost center not found" };
    }

    const { error: updateError } = await supabase
      .from("cost_centers")
      .update({ is_locked, updated_by: ctx.profile.id })
      .eq("id", id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "cost_centers",
      entity_id: id,
      entity_reference: existing.cost_center_code,
      action: is_locked ? "cost_center.lock" : "cost_center.unlock",
      old_values: { is_locked: existing.is_locked },
      new_values: { is_locked },
      owner_company_id: existing.owner_company_id ?? ctx.profile.owner_company_id,
      branch_id: existing.branch_id ?? ctx.profile.branch_id,
    });

    revalidateFinanceBasicsPages();
    return { success: true };
  } catch (error) {
    console.error("toggleCostCenterLock exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getActiveCostCentersForSelect(
  filters?: { ownerCompanyId?: number; branchId?: number },
): Promise<ActionResult<FinanceBasicsSelectOption[]>> {
  try {
    await getAuthContext();
    const supabase = await createClient();
    let query = supabase
      .from("cost_centers")
      .select("id, cost_center_code, cost_center_name_en, parent_cost_center_id, owner_company_id, branch_id, is_system, is_locked")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("cost_center_name_en", { ascending: true });

    if (filters?.ownerCompanyId) {
      query = query.eq("owner_company_id", filters.ownerCompanyId);
    }
    if (filters?.branchId) {
      query = query.eq("branch_id", filters.branchId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("getActiveCostCentersForSelect error", error);
      return { success: false, error: error.message };
    }

    const options: FinanceBasicsSelectOption[] = (data || []).map((row) => ({
      value: row.id,
      label: row.cost_center_name_en,
      code: row.cost_center_code,
      parent_id: row.parent_cost_center_id,
      is_system: row.is_system,
      is_locked: row.is_locked,
    }));

    return { success: true, data: options };
  } catch (error) {
    console.error("getActiveCostCentersForSelect exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// PROFIT CENTERS
// ============================================================================

const PROFIT_CENTER_RELATIONS_SELECT =
  "*, parent:profit_centers!parent_profit_center_id(profit_center_code, profit_center_name_en, profit_center_name_ar), owner_company:owner_companies(company_code, legal_name_en), branch:branches(branch_code, branch_name_en, branch_name_ar)";

export async function createProfitCenter(
  input: CreateProfitCenterInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = createProfitCenterSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const dataToInsert = {
      ...validated,
      profit_center_name_ar: validated.profit_center_name_ar || null,
      profit_center_type_code: validated.profit_center_type_code || null,
      parent_profit_center_id: validated.parent_profit_center_id ?? null,
      owner_company_id: validated.owner_company_id ?? null,
      branch_id: validated.branch_id ?? null,
      description_en: validated.description_en || null,
      description_ar: validated.description_ar || null,
      notes: validated.notes || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("profit_centers")
      .insert(dataToInsert)
      .select("id, profit_center_code")
      .single();

    if (error) {
      console.error("createProfitCenter error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "profit_centers",
      entity_id: data.id,
      entity_reference: data.profit_center_code,
      action: "create",
      new_values: validated,
      owner_company_id: validated.owner_company_id ?? undefined,
      branch_id: validated.branch_id ?? undefined,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createProfitCenter exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateProfitCenter(
  input: UpdateProfitCenterInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = updateProfitCenterSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const { id, ...updates } = validated;
    if (updates.parent_profit_center_id === id) {
      return { success: false, error: "Profit center cannot be its own parent" };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("profit_centers").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Profit center not found" };
    }

    if (oldData.is_locked && !isSystemAdmin(ctx.roleCodes)) {
      return lockedRecordError();
    }

    const dataToUpdate = {
      ...updates,
      profit_center_name_ar: nullifyEmpty(updates.profit_center_name_ar),
      profit_center_type_code: nullifyEmpty(updates.profit_center_type_code),
      description_en: nullifyEmpty(updates.description_en),
      description_ar: nullifyEmpty(updates.description_ar),
      notes: nullifyEmpty(updates.notes),
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase.from("profit_centers").update(dataToUpdate).eq("id", id);
    if (error) {
      console.error("updateProfitCenter error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    await logAudit({
      module_code: "master_data",
      entity_name: "profit_centers",
      entity_id: id,
      entity_reference: oldData.profit_center_code,
      action: "update",
      old_values,
      new_values,
      owner_company_id: oldData.owner_company_id ?? undefined,
      branch_id: oldData.branch_id ?? undefined,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateProfitCenter exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function toggleProfitCenterStatus(
  input: ToggleFinanceBasicsStatusInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = toggleFinanceBasicsStatusSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const { id, is_active, deactivation_reason } = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("profit_centers").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Profit center not found" };
    }

    const dataToUpdate = {
      is_active,
      deactivated_at: is_active ? null : new Date().toISOString(),
      deactivated_by: is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: is_active ? null : deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase.from("profit_centers").update(dataToUpdate).eq("id", id);
    if (error) {
      console.error("toggleProfitCenterStatus error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    await logAudit({
      module_code: "master_data",
      entity_name: "profit_centers",
      entity_id: id,
      entity_reference: oldData.profit_center_code,
      action: is_active ? "activate" : "deactivate",
      old_values,
      new_values,
      owner_company_id: oldData.owner_company_id ?? undefined,
      branch_id: oldData.branch_id ?? undefined,
    });

    revalidateFinanceBasicsPages();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("toggleProfitCenterStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getProfitCenters(
  filters?: ProfitCenterFilters,
): Promise<ActionResult<ProfitCenterWithRelations[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    let query = supabase
      .from("profit_centers")
      .select(PROFIT_CENTER_RELATIONS_SELECT)
      .order("sort_order", { ascending: true })
      .order("profit_center_name_en", { ascending: true });

    if (filters?.search) {
      query = query.or(
        `profit_center_code.ilike.%${filters.search}%,profit_center_name_en.ilike.%${filters.search}%,profit_center_name_ar.ilike.%${filters.search}%`,
      );
    }
    if (filters?.owner_company_id) {
      query = query.eq("owner_company_id", filters.owner_company_id);
    }
    if (filters?.branch_id) {
      query = query.eq("branch_id", filters.branch_id);
    }
    if (filters?.parent_profit_center_id) {
      query = query.eq("parent_profit_center_id", filters.parent_profit_center_id);
    }
    if (filters?.profit_center_type_code) {
      query = query.eq("profit_center_type_code", filters.profit_center_type_code);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq("is_active", filters.is_active);
    }
    if (filters?.is_system !== undefined) {
      query = query.eq("is_system", filters.is_system);
    }
    if (filters?.is_locked !== undefined) {
      query = query.eq("is_locked", filters.is_locked);
    }

    const { data, error } = await query;
    if (error) {
      console.error("getProfitCenters error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("getProfitCenters exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getProfitCenterById(
  id: number,
): Promise<ActionResult<ProfitCenterWithRelations>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profit_centers")
      .select(PROFIT_CENTER_RELATIONS_SELECT)
      .eq("id", id)
      .single();

    if (error) {
      console.error("getProfitCenterById error", error);
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: "Profit center not found" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getProfitCenterById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteProfitCenter(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes)) {
      return { success: false, error: "Only system administrators can delete finance basics records. Use deactivate instead." };
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("profit_centers").select("*").eq("id", id).single();
    if (!oldData) {
      return { success: false, error: "Profit center not found" };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "profit_centers",
      entity_id: id,
      entity_reference: oldData.profit_center_code,
      action: "delete",
      old_values: oldData,
      owner_company_id: oldData.owner_company_id ?? undefined,
      branch_id: oldData.branch_id ?? undefined,
    });

    const { error } = await supabase.from("profit_centers").delete().eq("id", id);
    if (error) {
      console.error("deleteProfitCenter error", error);
      return {
        success: false,
        error: error.message.includes("foreign key")
          ? "Cannot delete profit center with related records (child centers, allocations, etc.). Deactivate instead."
          : error.message,
      };
    }

    revalidateFinanceBasicsPages();
    return { success: true };
  } catch (error) {
    console.error("deleteProfitCenter exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function toggleProfitCenterLock(
  id: number,
  is_locked: boolean,
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes) && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Lock permission required" };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("profit_centers")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Profit center not found" };
    }

    const { error: updateError } = await supabase
      .from("profit_centers")
      .update({ is_locked, updated_by: ctx.profile.id })
      .eq("id", id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "profit_centers",
      entity_id: id,
      entity_reference: existing.profit_center_code,
      action: is_locked ? "profit_center.lock" : "profit_center.unlock",
      old_values: { is_locked: existing.is_locked },
      new_values: { is_locked },
      owner_company_id: existing.owner_company_id ?? ctx.profile.owner_company_id,
      branch_id: existing.branch_id ?? ctx.profile.branch_id,
    });

    revalidateFinanceBasicsPages();
    return { success: true };
  } catch (error) {
    console.error("toggleProfitCenterLock exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getActiveProfitCentersForSelect(
  filters?: { ownerCompanyId?: number; branchId?: number },
): Promise<ActionResult<FinanceBasicsSelectOption[]>> {
  try {
    await getAuthContext();
    const supabase = await createClient();
    let query = supabase
      .from("profit_centers")
      .select("id, profit_center_code, profit_center_name_en, parent_profit_center_id, owner_company_id, branch_id, is_system, is_locked")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("profit_center_name_en", { ascending: true });

    if (filters?.ownerCompanyId) {
      query = query.eq("owner_company_id", filters.ownerCompanyId);
    }
    if (filters?.branchId) {
      query = query.eq("branch_id", filters.branchId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("getActiveProfitCentersForSelect error", error);
      return { success: false, error: error.message };
    }

    const options: FinanceBasicsSelectOption[] = (data || []).map((row) => ({
      value: row.id,
      label: row.profit_center_name_en,
      code: row.profit_center_code,
      parent_id: row.parent_profit_center_id,
      is_system: row.is_system,
      is_locked: row.is_locked,
    }));

    return { success: true, data: options };
  } catch (error) {
    console.error("getActiveProfitCentersForSelect exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
