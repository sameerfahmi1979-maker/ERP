"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import {saveFinanceReferenceRecord} from '@/server/finance-reference-save';
import {canReadFinanceReferences} from '@/lib/master-data/finance-reference-contract';
import {saveCurrencyRecord} from "@/server/currency-save";
import {saveFinanceCenterRecord} from "@/server/finance-center-save";
import {attachFinanceReferenceLabels} from "@/server/finance-reference-labels";
import {readAllPages} from "@/server/reads/all-pages";
import {literalContains} from "@/lib/reads/search";
import {z} from "zod";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import type {WorkspaceSaveResult} from "@/server/workspace-save";
import {workspaceValidationFailure} from "@/lib/workspace/field-errors";
import {
  createCurrencySchema,
  updateCurrencySchema,
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

function viewPermissionError<T>(): ActionResult<T> {
  return { success: false, error: "You do not have permission to view finance basics data" };
}

function splitReferenceInput(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const {id,...data}=input as Record<string,unknown>;
 return typeof id==='number'&&Number.isSafeInteger(id)&&id>0?{id,data}:null;
}

// ============================================================================
// CURRENCIES
// ============================================================================

export async function createCurrency(input: CreateCurrencyInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed=createCurrencySchema.safeParse(input);
  if(!parsed.success)return workspaceValidationFailure(parsed.error.issues);
  return saveCurrencyRecord("save",null,parsed.data,contract);
}

export async function updateCurrency(input: UpdateCurrencyInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed=updateCurrencySchema.safeParse(input);
  if(!parsed.success)return workspaceValidationFailure(parsed.error.issues);
  const {id,...data}=parsed.data;
  return saveCurrencyRecord("save",id,data,contract);
}

export async function toggleCurrencyStatus(input: ToggleFinanceBasicsStatusInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed=toggleFinanceBasicsStatusSchema.strict().safeParse(input);
  if(!parsed.success)return workspaceValidationFailure(parsed.error.issues);
  const {id,...data}=parsed.data;
  return saveCurrencyRecord("active",id,data,contract);
}

export async function getCurrencies(
  filters?: CurrencyFilters,
): Promise<ActionResult<Currency[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")&&!hasGlobalPermission(ctx,"master_data.finance_basics.manage")&&!hasGlobalPermission(ctx,"master_data.lookups.lock")) {
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
  if(!Number.isSafeInteger(id)||id<1)return {success:false,error:"Currency not found"};
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")&&!hasGlobalPermission(ctx,"master_data.finance_basics.manage")&&!hasGlobalPermission(ctx,"master_data.lookups.lock")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("currencies").select("*").eq("id", id).maybeSingle();
    if (error) {
      return { success: false, error: "Currency could not be loaded. Try again." };
    }
    if (!data) {
      return { success: false, error: "Currency not found" };
    }

    return { success: true, data };
  } catch {
    return { success: false, error: "Currency could not be loaded. Try again." };
  }
}

/** Compatibility entry point: retire in place, never erase currency history or references. */
export async function deleteCurrency(id: number, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  return saveCurrencyRecord("retire",id,{is_active:false},contract);
}

export async function toggleCurrencyLock(id: number, is_locked: boolean, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  if(typeof is_locked!=="boolean")return {success:false,error:"Choose a valid currency lock state."};
  return saveCurrencyRecord("lock",id,{is_locked},contract);
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

export async function createPaymentTerm(input: CreatePaymentTermInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 return saveFinanceReferenceRecord("payment_terms","save",null,input,contract);
}

export async function updatePaymentTerm(input: UpdatePaymentTermInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 const split=splitReferenceInput(input);if(!split)return {success:false,error:"A valid finance record ID and object payload are required."};
 const {id,data}=split;
 return saveFinanceReferenceRecord("payment_terms","save",id,data,contract);
}

export async function togglePaymentTermStatus(input: ToggleFinanceBasicsStatusInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 const split=splitReferenceInput(input);if(!split)return {success:false,error:"A valid finance record ID and object payload are required."};
 const {id,data}=split;
 return saveFinanceReferenceRecord("payment_terms","active",id,data,contract);
}

export async function getPaymentTerms(
  filters?: PaymentTermFilters,
): Promise<ActionResult<PaymentTerm[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canReadFinanceReferences(ctx)) {
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

export async function getPaymentTermById(id: number): Promise<ActionResult<PaymentTerm | null>> {
  if(!Number.isSafeInteger(id)||id<1)return {success:false,error:"Invalid finance record ID"};
  try {
    const ctx = await getAuthContext();
    if (!canReadFinanceReferences(ctx)) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("payment_terms").select("*").eq("id", id).maybeSingle();
    if (error) {
      console.error("getPaymentTermById error", error);
      return { success: false, error: "The finance record could not be loaded. Try again." };
    }
    if (!data) {
      return { success: true, data: null };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getPaymentTermById exception", error);
    return { success: false, error: "The finance record could not be loaded. Try again." };
  }
}

/** Historical export name; this now RETIRES in place and never hard-deletes. */
export async function deletePaymentTerm(id: number, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 return saveFinanceReferenceRecord("payment_terms","retire",id,{is_active:false},contract);
}

export async function togglePaymentTermLock(id: number, is_locked: boolean, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 return saveFinanceReferenceRecord("payment_terms","lock",id,{is_locked},contract);
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

export async function createTaxType(input: CreateTaxTypeInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 return saveFinanceReferenceRecord("tax_types","save",null,input,contract);
}

export async function updateTaxType(input: UpdateTaxTypeInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 const split=splitReferenceInput(input);if(!split)return {success:false,error:"A valid finance record ID and object payload are required."};
 const {id,data}=split;
 return saveFinanceReferenceRecord("tax_types","save",id,data,contract);
}

export async function toggleTaxTypeStatus(input: ToggleFinanceBasicsStatusInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 const split=splitReferenceInput(input);if(!split)return {success:false,error:"A valid finance record ID and object payload are required."};
 const {id,data}=split;
 return saveFinanceReferenceRecord("tax_types","active",id,data,contract);
}

export async function getTaxTypes(
  filters?: TaxTypeFilters,
): Promise<ActionResult<TaxType[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canReadFinanceReferences(ctx)) {
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

export async function getTaxTypeById(id: number): Promise<ActionResult<TaxType | null>> {
  if(!Number.isSafeInteger(id)||id<1)return {success:false,error:"Invalid finance record ID"};
  try {
    const ctx = await getAuthContext();
    if (!canReadFinanceReferences(ctx)) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("tax_types").select("*").eq("id", id).maybeSingle();
    if (error) {
      console.error("getTaxTypeById error", error);
      return { success: false, error: "The finance record could not be loaded. Try again." };
    }
    if (!data) {
      return { success: true, data: null };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getTaxTypeById exception", error);
    return { success: false, error: "The finance record could not be loaded. Try again." };
  }
}

/** Historical export name; this now RETIRES in place and never hard-deletes. */
export async function deleteTaxType(id: number, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 return saveFinanceReferenceRecord("tax_types","retire",id,{is_active:false},contract);
}

export async function toggleTaxTypeLock(id: number, is_locked: boolean, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 return saveFinanceReferenceRecord("tax_types","lock",id,{is_locked},contract);
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

export async function createBank(input: CreateBankInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 return saveFinanceReferenceRecord("banks","save",null,input,contract);
}

export async function updateBank(input: UpdateBankInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 const split=splitReferenceInput(input);if(!split)return {success:false,error:"A valid finance record ID and object payload are required."};
 const {id,data}=split;
 return saveFinanceReferenceRecord("banks","save",id,data,contract);
}

export async function toggleBankStatus(input: ToggleFinanceBasicsStatusInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 const split=splitReferenceInput(input);if(!split)return {success:false,error:"A valid finance record ID and object payload are required."};
 const {id,data}=split;
 return saveFinanceReferenceRecord("banks","active",id,data,contract);
}

export async function getBanks(
  filters?: BankFilters,
): Promise<ActionResult<BankWithCountry[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canReadFinanceReferences(ctx)) {
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

export async function getBankById(id: number): Promise<ActionResult<BankWithCountry | null>> {
  if(!Number.isSafeInteger(id)||id<1)return {success:false,error:"Invalid finance record ID"};
  try {
    const ctx = await getAuthContext();
    if (!canReadFinanceReferences(ctx)) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("banks")
      .select("*, country:countries(country_code, name_en, name_ar)")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("getBankById error", error);
      return { success: false, error: "The finance record could not be loaded. Try again." };
    }
    if (!data) {
      return { success: true, data: null };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getBankById exception", error);
    return { success: false, error: "The finance record could not be loaded. Try again." };
  }
}

/** Historical export name; this now RETIRES in place and never hard-deletes. */
export async function deleteBank(id: number, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 return saveFinanceReferenceRecord("banks","retire",id,{is_active:false},contract);
}

export async function toggleBankLock(id: number, is_locked: boolean, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
 return saveFinanceReferenceRecord("banks","lock",id,{is_locked},contract);
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
  "*, parent:cost_centers!parent_cost_center_id(cost_center_code, cost_center_name_en, cost_center_name_ar), owner_company:owner_companies(company_code, legal_name_en), branch:branches!cost_centers_branch_id_fkey(branch_code, branch_name_en, branch_name_ar)";

export async function createCostCenter(input: CreateCostCenterInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed=createCostCenterSchema.safeParse(input);
  if(!parsed.success)return workspaceValidationFailure(parsed.error.issues);
  return saveFinanceCenterRecord("cost_centers","save",null,parsed.data,contract);
}

export async function updateCostCenter(input: UpdateCostCenterInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed=updateCostCenterSchema.safeParse(input);
  if(!parsed.success)return workspaceValidationFailure(parsed.error.issues);
  const {id,...data}=parsed.data;
  return saveFinanceCenterRecord("cost_centers","save",id,data,contract);
}

export async function toggleCostCenterStatus(input: ToggleFinanceBasicsStatusInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed=toggleFinanceBasicsStatusSchema.strict().safeParse(input);
  if(!parsed.success)return workspaceValidationFailure(parsed.error.issues);
  const {id,...data}=parsed.data;
  return saveFinanceCenterRecord("cost_centers","active",id,data,contract);
}

export async function getCostCenters(
  filters?: CostCenterFilters,
): Promise<ActionResult<CostCenterWithRelations[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")&&!hasGlobalPermission(ctx,"master_data.finance_basics.manage")&&!hasGlobalPermission(ctx,"master_data.lookups.lock")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const data = await readAllPages<CostCenterWithRelations>(async (from, to) => {
      let query = supabase
        .from("cost_centers")
        .select(COST_CENTER_RELATIONS_SELECT, { count: "exact" })
        .retry(false)
        .order("sort_order", { ascending: true })
        .order("cost_center_name_en", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      if (filters?.search) {
        const value = literalContains(filters.search);
        query = query.or(
          `cost_center_code.ilike.${value},cost_center_name_en.ilike.${value},cost_center_name_ar.ilike.${value}`,
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

      const { data, error, count } = await query;
      return { data: data as CostCenterWithRelations[] | null, error, count };
    }, { identity: row => row.id });

    return { success: true, data: await attachFinanceReferenceLabels('cost_centers',data) };
  } catch (error) {
    console.error("getCostCenters exception", error);
    return { success: false, error: "Finance data could not be loaded. Retry without discarding your draft." };
  }
}

export async function getCostCenterById(
  id: number,
): Promise<ActionResult<CostCenterWithRelations>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")&&!hasGlobalPermission(ctx,"master_data.finance_basics.manage")&&!hasGlobalPermission(ctx,"master_data.lookups.lock")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cost_centers")
      .select(COST_CENTER_RELATIONS_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("getCostCenterById error", error);
      return { success: false, error: "Finance data could not be loaded. Retry without discarding your draft." };
    }
    if (!data) {
      return { success: false, error: "Cost center not found" };
    }

    return { success: true, data: (await attachFinanceReferenceLabels('cost_centers',[data]))[0] };
  } catch (error) {
    console.error("getCostCenterById exception", error);
    return { success: false, error: "Finance data could not be loaded. Retry without discarding your draft." };
  }
}

export async function deleteCostCenter(id: number, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  // Historical public name retained for callers: this is retirement, never deletion.
  return saveFinanceCenterRecord("cost_centers","retire",id,{is_active:false},contract);
}

export async function toggleCostCenterLock(id: number, is_locked: boolean, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  if(!z.boolean().safeParse(is_locked).success)return {success:false,error:"Choose a valid lock state."};
  return saveFinanceCenterRecord("cost_centers","lock",id,{is_locked},contract);
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
  "*, parent:profit_centers!parent_profit_center_id(profit_center_code, profit_center_name_en, profit_center_name_ar), owner_company:owner_companies(company_code, legal_name_en), branch:branches!profit_centers_branch_id_fkey(branch_code, branch_name_en, branch_name_ar)";

export async function createProfitCenter(input: CreateProfitCenterInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed=createProfitCenterSchema.safeParse(input);
  if(!parsed.success)return workspaceValidationFailure(parsed.error.issues);
  return saveFinanceCenterRecord("profit_centers","save",null,parsed.data,contract);
}

export async function updateProfitCenter(input: UpdateProfitCenterInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed=updateProfitCenterSchema.safeParse(input);
  if(!parsed.success)return workspaceValidationFailure(parsed.error.issues);
  const {id,...data}=parsed.data;
  return saveFinanceCenterRecord("profit_centers","save",id,data,contract);
}

export async function toggleProfitCenterStatus(input: ToggleFinanceBasicsStatusInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed=toggleFinanceBasicsStatusSchema.strict().safeParse(input);
  if(!parsed.success)return workspaceValidationFailure(parsed.error.issues);
  const {id,...data}=parsed.data;
  return saveFinanceCenterRecord("profit_centers","active",id,data,contract);
}

export async function getProfitCenters(
  filters?: ProfitCenterFilters,
): Promise<ActionResult<ProfitCenterWithRelations[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")&&!hasGlobalPermission(ctx,"master_data.finance_basics.manage")&&!hasGlobalPermission(ctx,"master_data.lookups.lock")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const data = await readAllPages<ProfitCenterWithRelations>(async (from, to) => {
      let query = supabase
        .from("profit_centers")
        .select(PROFIT_CENTER_RELATIONS_SELECT, { count: "exact" })
        .retry(false)
        .order("sort_order", { ascending: true })
        .order("profit_center_name_en", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      if (filters?.search) {
        const value = literalContains(filters.search);
        query = query.or(
          `profit_center_code.ilike.${value},profit_center_name_en.ilike.${value},profit_center_name_ar.ilike.${value}`,
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

      const { data, error, count } = await query;
      return { data: data as ProfitCenterWithRelations[] | null, error, count };
    }, { identity: row => row.id });

    return { success: true, data: await attachFinanceReferenceLabels('profit_centers',data) };
  } catch (error) {
    console.error("getProfitCenters exception", error);
    return { success: false, error: "Finance data could not be loaded. Retry without discarding your draft." };
  }
}

export async function getProfitCenterById(
  id: number,
): Promise<ActionResult<ProfitCenterWithRelations>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.finance_basics.view")&&!hasGlobalPermission(ctx,"master_data.finance_basics.manage")&&!hasGlobalPermission(ctx,"master_data.lookups.lock")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profit_centers")
      .select(PROFIT_CENTER_RELATIONS_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("getProfitCenterById error", error);
      return { success: false, error: "Finance data could not be loaded. Retry without discarding your draft." };
    }
    if (!data) {
      return { success: false, error: "Profit center not found" };
    }

    return { success: true, data: (await attachFinanceReferenceLabels('profit_centers',[data]))[0] };
  } catch (error) {
    console.error("getProfitCenterById exception", error);
    return { success: false, error: "Finance data could not be loaded. Retry without discarding your draft." };
  }
}

export async function deleteProfitCenter(id: number, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  // Historical public name retained for callers: this is retirement, never deletion.
  return saveFinanceCenterRecord("profit_centers","retire",id,{is_active:false},contract);
}

export async function toggleProfitCenterLock(id: number, is_locked: boolean, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  if(!z.boolean().safeParse(is_locked).success)return {success:false,error:"Choose a valid lock state."};
  return saveFinanceCenterRecord("profit_centers","lock",id,{is_locked},contract);
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
