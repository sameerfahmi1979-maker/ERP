import {z} from 'zod';
import {canUseApplication,hasGlobalPermission,hasPermission} from '@/lib/rbac/scope';
import type {AuthContext} from '@/lib/rbac/check';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';

export type FinanceReferenceEntity='banks'|'payment_terms'|'tax_types';
export type FinanceReferenceAction='save'|'active'|'lock'|'retire';
export const financeReferencePaths:Record<FinanceReferenceEntity,string>={banks:'banks',payment_terms:'payment-terms',tax_types:'tax-types'};
/** Finance-only display admission. A scoped system role combined with a global
 * group role is NOT a globally assigned system administrator. DB checks agree. */
export function isFinanceSystemAdmin(ctx:AuthContext){return canUseApplication(ctx)&&!!ctx.roleAssignments?.some(a=>a.roleCode==='system_admin'&&a.ownerCompanyId===null&&a.branchId===null);}
export function canReadFinanceReferences(ctx:AuthContext){return hasPermission(ctx,'master_data.finance_basics.view')||hasGlobalPermission(ctx,'master_data.finance_basics.manage')||hasGlobalPermission(ctx,'master_data.lookups.lock');}
export function financeReferencePermissions(ctx:AuthContext){return {manage:hasGlobalPermission(ctx,'master_data.finance_basics.manage'),lock:hasGlobalPermission(ctx,'master_data.lookups.lock'),overrideLocked:isFinanceSystemAdmin(ctx),retire:isFinanceSystemAdmin(ctx)};}
export const financeReferenceReceiptSchema=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),revision:z.string().max(19).regex(/^[1-9]\d*$/).refine(s=>/^[1-9]\d{0,18}$/.test(s)&&BigInt(s)<=BigInt('9223372036854775807')),changed:z.boolean(),replayed:z.boolean()}).strict();
export function verifyFinanceReferenceReceipt(raw:unknown,id:number|null,contract:WorkspaceSaveContract){
 const r=financeReferenceReceiptSchema.safeParse(raw);if(!r.success)return null;
 if(id===null)return contract.revision===null&&r.data.changed&&r.data.revision==='1'?r.data:null;
 if(r.data.id!==id||!contract.revision||!/^[1-9]\d{0,18}$/.test(contract.revision)||BigInt(contract.revision)>BigInt('9223372036854775807'))return null;
 return BigInt(r.data.revision)===BigInt(contract.revision)+(r.data.changed?BigInt(1):BigInt(0))?r.data:null;
}
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const code=z.string().regex(/^[A-Z0-9_]{2,50}$/,'Use 2–50 uppercase letters, digits or underscores');
const name=z.string().trim().min(2,'English name requires at least two characters').max(255);
const text=(max:number)=>z.string().max(max).nullable().optional();
const integer=z.number().int().min(0).max(2147483647);
const percent=(digits:number)=>z.number().min(0).max(100).refine(n=>n===Number(n.toFixed(digits)),`Use at most ${digits} decimal places`);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Use a valid calendar date').refine(s=>{const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;},'Use a valid calendar date');
const common={description_en:text(1000),description_ar:text(1000),notes:text(2000),sort_order:integer.optional(),is_active:z.boolean().optional()};
const bank={bank_name_en:name,bank_name_ar:text(255),short_name:text(50),country_id:id.nullable().optional(),bank_type_code:text(50),
 swift_code:z.string().regex(/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/,'SWIFT/BIC must have 8 or 11 uppercase characters').nullable().optional(),
 website_url:z.url({protocol:/^https?$/}).max(2048).nullable().optional(),contact_phone:text(30),contact_email:z.email().max(320).nullable().optional(),...common};
const term={term_name_en:name,term_name_ar:text(255),due_days:integer.optional(),advance_percentage:percent(2).optional(),retention_percentage:percent(2).optional(),calculation_notes:text(1000),...common};
const tax={tax_name_en:name,tax_name_ar:text(255),tax_rate:percent(4).optional(),tax_treatment_code:z.string().min(1).max(50),is_vat:z.boolean().optional(),is_reverse_charge:z.boolean().optional(),applies_to_sales:z.boolean().optional(),applies_to_purchases:z.boolean().optional(),applies_to_scrap:z.boolean().optional(),effective_from:date.optional(),effective_to:date.nullable().optional(),...common};
export const financeReferenceCreateSchemas={banks:z.object({bank_code:code,...bank}).strict(),payment_terms:z.object({term_code:code,...term}).strict(),tax_types:z.object({tax_code:code,...tax}).strict()};
export const financeReferenceUpdateSchemas={banks:z.object(bank).partial().strict(),payment_terms:z.object(term).partial().strict(),tax_types:z.object(tax).partial().strict()};
// Existing unchanged noncanonical text may be supplied by a legacy client. The
// DB compares it to the stored row and validates only actual changes. Preserve
// strict JSON types/field allowlists here, and bounded changed fields in forms.
function historicalUpdate(shape:Record<string,z.ZodType>){return z.object(Object.fromEntries(Object.entries(shape).map(([key,value])=>[key,['_name_en','_name_ar'].some(s=>key.endsWith(s))||['short_name','bank_type_code','swift_code','website_url','contact_phone','contact_email','description_en','description_ar','notes','calculation_notes','tax_treatment_code'].includes(key)?(key.endsWith('_name_en')||key==='tax_treatment_code'?z.string().optional():z.string().nullable().optional()):value.optional()]))).strict();}
const wireUpdates={banks:historicalUpdate(bank),payment_terms:historicalUpdate(term),tax_types:historicalUpdate(tax)};
export const financeReferenceActiveSchema=z.object({is_active:z.boolean(),deactivation_reason:text(500)}).strict();
export const financeReferenceLockSchema=z.object({is_locked:z.boolean()}).strict();
export const financeReferenceRetireSchema=z.object({is_active:z.literal(false)}).strict();
export function financeReferencePayloadSchema(entity:FinanceReferenceEntity,action:FinanceReferenceAction,creating:boolean){return action==='save'?(creating?financeReferenceCreateSchemas[entity]:wireUpdates[entity]):action==='active'?financeReferenceActiveSchema:action==='lock'?financeReferenceLockSchema:financeReferenceRetireSchema;}
export type FinanceReferenceRequest={action:FinanceReferenceAction;data:Record<string,unknown>};
export function validFinanceReferenceRequest(entity:FinanceReferenceEntity,value:unknown,recordId:number|null):value is FinanceReferenceRequest{
 const envelope=z.object({action:z.enum(['save','active','lock','retire']),data:z.record(z.string(),z.unknown())}).strict().safeParse(value);
 return envelope.success&&(recordId!==null||envelope.data.action==='save')&&financeReferencePayloadSchema(entity,envelope.data.action,recordId===null).safeParse(envelope.data.data).success;
}
