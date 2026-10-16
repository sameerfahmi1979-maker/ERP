/**
 * Zod validation schemas for the Unified Party Master module.
 * Phase ERP BASE 002F.5A.2
 */

import { z } from "zod";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date.").refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a valid calendar date.");
function validateChildDates(value: {issue_date?:string|null;expiry_date?:string|null;effective_from?:string|null;effective_to?:string|null;expiry_required?:boolean;issuing_emirate_id?:number|null;issuing_country_id?:number|null},ctx:z.RefinementCtx,allowExistingExpiry=false){
  for(const [start,end,startKey,endKey] of [[value.issue_date,value.expiry_date,'issue_date','expiry_date'],[value.effective_from,value.effective_to,'effective_from','effective_to']] as const){
    if(start&&end&&end<start)ctx.addIssue({code:'custom',path:[endKey],message:`The end date cannot precede the ${startKey==='issue_date'?'issue':'effective start'} date.`});
  }
  // An update may retain the stored expiry by omitting it. The database checks
  // the merged row; omission must never be treated as an explicit clear.
  if(value.expiry_required&&(!allowExistingExpiry||value.expiry_date!==undefined)&&!value.expiry_date)ctx.addIssue({code:'custom',path:['expiry_date'],message:'An expiry date is required.'});
  if(value.issuing_emirate_id!=null&&value.issuing_country_id==null)ctx.addIssue({code:'custom',path:['issuing_country_id'],message:'Choose the country for this issuing region.'});
}

function validateGeographyParents(
  value: { emirate_id?: number | null; city_id?: number | null; area_zone_id?: number | null },
  ctx: z.RefinementCtx,
) {
  if (value.city_id != null && value.emirate_id == null) {
    ctx.addIssue({ code: "custom", path: ["emirate_id"], message: "Choose the region for this city." });
  }
  if (value.area_zone_id != null && value.city_id == null) {
    ctx.addIssue({ code: "custom", path: ["city_id"], message: "Choose the city for this area." });
  }
}

export const createPartySchema = z.object({
  initial_type_code: z.string().trim().min(1, "Choose an initial party type").max(100).optional(),
  display_name: z.string().trim().min(1, "Display name is required"),
  legal_name_en: z.string().trim().min(1, "Legal name (English) is required"),
  legal_name_ar: z.string().nullable().optional(),
  trade_name_en: z.string().nullable().optional(),
  trade_name_ar: z.string().nullable().optional(),
  short_name: z.string().nullable().optional(),
  party_nature_id: z.number().int().positive("Party nature is required"),
  primary_party_type_id: z.number().int().positive().nullable().optional(),
  parent_party_id: z.number().int().positive().nullable().optional(),
  main_phone: z.string().nullable().optional(),
  main_mobile: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  main_email: z.string().email("Invalid email format").nullable().optional().or(z.literal("").transform(() => null)),
  alternate_email: z.string().email("Invalid email format").nullable().optional().or(z.literal("").transform(() => null)),
  website: z.string().url("Invalid URL format").nullable().optional().or(z.literal("").transform(() => null)),
  country_id: z.number().int().positive("Country is required"),
  emirate_id: z.number().int().positive().nullable().optional(),
  city_id: z.number().int().positive().nullable().optional(),
  area_zone_id: z.number().int().positive().nullable().optional(),
  po_box: z.string().nullable().optional(),
  full_address_text: z.string().nullable().optional(),
  google_map_url: z.string().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  party_status_id: z.number().int().positive("Party status is required"),
  is_active: z.boolean().optional().default(true),
  remarks: z.string().nullable().optional(),
}).superRefine(validateGeographyParents).superRefine((value,ctx)=>{
  if(value.initial_type_code!==undefined&&value.primary_party_type_id!=null)ctx.addIssue({code:'custom',path:['initial_type_code'],message:'Choose the initial party type by code or ID, not both.'});
});

// Creation defaults must not turn omitted update flags into writes. Keep the
// same field validation and geography refinement, without creation defaults.
export const updatePartySchema = z.object({
  ...createPartySchema.shape,
  initial_type_code: z.never().optional(),
  id: z.number().int().positive(),
  is_active: z.boolean().optional(),
}).superRefine(validateGeographyParents);

const partyLicenseFields = z.object({
  party_id: z.number().int().positive(),
  license_type_id: z.number().int().positive("License type is required"),
  license_number: z.string().min(1, "License number is required"),
  license_name: z.string().nullable().optional(),
  issuing_authority_party_id: z.number().int().positive().nullable().optional(),
  issuing_country_id: z.number().int().positive().nullable().optional(),
  issuing_emirate_id: z.number().int().positive().nullable().optional(),
  issue_date: calendarDate.nullable().optional(),
  expiry_date: calendarDate.nullable().optional(),
  renewal_required: z.boolean().optional().default(false),
  renewal_notice_days: z.number().int().nonnegative().nullable().optional(),
  license_status_id: z.number().int().positive("License status is required"),
  license_activity_text: z.string().nullable().optional(),
  license_document_id: z.number().int().positive().nullable().optional(),
  is_primary: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  remarks: z.string().nullable().optional(),
});

export const createPartyLicenseSchema = partyLicenseFields.superRefine(validateChildDates);
export const updatePartyLicenseSchema = partyLicenseFields.extend({
  id: z.number().int().positive(),
  renewal_required: z.boolean().optional(),
  is_primary: z.boolean().optional(),
  is_active: z.boolean().optional(),
}).superRefine(validateChildDates);

const partyTaxFields = z.object({
  party_id: z.number().int().positive(),
  tax_type_id: z.number().int().positive("Tax type is required"),
  tax_registration_number: z.string().min(1, "Tax registration number is required"),
  tax_country_id: z.number().int().positive().nullable().optional(),
  tax_status_id: z.number().int().positive("Tax status is required"),
  effective_from: calendarDate.nullable().optional(),
  effective_to: calendarDate.nullable().optional(),
  certificate_document_id: z.number().int().positive().nullable().optional(),
  reverse_charge_applicable: z.boolean().optional().default(false),
  vat_exempt: z.boolean().optional().default(false),
  is_primary: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  remarks: z.string().nullable().optional(),
});

export const createPartyTaxRegistrationSchema = partyTaxFields.superRefine(validateChildDates);
export const updatePartyTaxRegistrationSchema = partyTaxFields.extend({
  id: z.number().int().positive(),
  reverse_charge_applicable: z.boolean().optional(),
  vat_exempt: z.boolean().optional(),
  is_primary: z.boolean().optional(),
  is_active: z.boolean().optional(),
}).superRefine(validateChildDates);

export const upsertPartyFinanceProfileSchema = z.object({
  party_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  default_currency_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  default_payment_term_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  default_payment_method_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  credit_limit: z.number().nonnegative().lt(100000000000000).refine(value => /^\d+(?:\.\d{1,4})?$/.test(String(value)), "Use at most four decimal places").nullable().optional(),
  credit_currency_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  // No patch defaults: omission must not release an existing hold.
  finance_hold: z.boolean().optional(),
  finance_hold_reason: z.string().trim().max(2000).nullable().optional(),
  finance_remarks: z.string().trim().max(4000).nullable().optional(),
}).strict().refine(value => Object.keys(value).some(key => key !== "party_id"), "Enter a finance change");

export const createPartyContactSchema = z.object({
  party_id: z.number().int().positive(),
  full_name: z.string().min(1, "Full name is required"),
  designation: z.string().nullable().optional(),
  department_id: z.number().int().positive().nullable().optional(),
  contact_role_id: z.number().int().positive().nullable().optional(),
  email: z.string().email("Invalid email format").nullable().optional().or(z.literal("").transform(() => null)),
  phone: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  is_primary: z.boolean().optional().default(false),
  is_accounts_contact: z.boolean().optional().default(false),
  is_sales_contact: z.boolean().optional().default(false),
  is_operations_contact: z.boolean().optional().default(false),
  is_hse_contact: z.boolean().optional().default(false),
  is_documents_contact: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  notes: z.string().nullable().optional(),
});

export const updatePartyContactSchema = createPartyContactSchema.extend({
  id: z.number().int().positive(),
  is_primary: z.boolean().optional(),
  is_accounts_contact: z.boolean().optional(),
  is_sales_contact: z.boolean().optional(),
  is_operations_contact: z.boolean().optional(),
  is_hse_contact: z.boolean().optional(),
  is_documents_contact: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const createPartyAddressSchema = z.object({
  party_id: z.number().int().positive(),
  address_type_id: z.number().int().positive("Address type is required"),
  address_name: z.string().nullable().optional(),
  country_id: z.number().int().positive("Country is required"),
  emirate_id: z.number().int().positive().nullable().optional(),
  city_id: z.number().int().positive().nullable().optional(),
  area_zone_id: z.number().int().positive().nullable().optional(),
  street: z.string().nullable().optional(),
  building: z.string().nullable().optional(),
  floor: z.string().nullable().optional(),
  office_no: z.string().nullable().optional(),
  po_box: z.string().nullable().optional(),
  landmark: z.string().nullable().optional(),
  google_map_url: z.string().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  is_primary: z.boolean().optional().default(false),
  is_billing_address: z.boolean().optional().default(false),
  is_shipping_address: z.boolean().optional().default(false),
  is_site_address: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  notes: z.string().nullable().optional(),
}).superRefine(validateGeographyParents);

export const updatePartyAddressSchema = z.object({
  ...createPartyAddressSchema.shape,
  id: z.number().int().positive(),
  is_primary: z.boolean().optional(),
  is_billing_address: z.boolean().optional(),
  is_shipping_address: z.boolean().optional(),
  is_site_address: z.boolean().optional(),
  is_active: z.boolean().optional(),
}).superRefine(validateGeographyParents);

export const createPartyBankDetailSchema = z.object({
  party_id: z.number().int().positive(),
  bank_id: z.number().int().positive().nullable().optional(),
  bank_name_text: z.string().nullable().optional(),
  account_holder_name: z.string().min(1, "Account holder name is required"),
  account_number: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  swift_code: z.string().nullable().optional(),
  currency_id: z.number().int().positive().nullable().optional(),
  branch_name: z.string().nullable().optional(),
  country_id: z.number().int().positive().nullable().optional(),
  is_primary: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  remarks: z.string().nullable().optional(),
});

export const updatePartyBankDetailSchema = createPartyBankDetailSchema.extend({
  id: z.number().int().positive(),
  is_primary: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

const partyDocumentFields = z.object({
  party_id: z.number().int().positive(),
  document_type_id: z.number().int().positive("Document type is required"),
  document_title: z.string().min(1, "Document title is required"),
  document_number: z.string().nullable().optional(),
  issue_date: calendarDate.nullable().optional(),
  expiry_date: calendarDate.nullable().optional(),
  issuing_authority_party_id: z.number().int().positive().nullable().optional(),
  expiry_required: z.boolean().optional().default(false),
  renewal_notice_days: z.number().int().nonnegative().nullable().optional(),
  document_status_id: z.number().int().positive("Document status is required"),
  remarks: z.string().nullable().optional(),
});

export const createPartyDocumentSchema = partyDocumentFields.superRefine(validateChildDates);
export const updatePartyDocumentSchema = partyDocumentFields.extend({
  id: z.number().int().positive(),
  expiry_required: z.boolean().optional(),
}).superRefine((value,ctx)=>validateChildDates(value,ctx,true));


export type CreatePartySchemaInput = z.infer<typeof createPartySchema>;
export type UpdatePartySchemaInput = z.infer<typeof updatePartySchema>;
export type CreatePartyLicenseInput = z.infer<typeof createPartyLicenseSchema>;
export type UpdatePartyLicenseInput = z.infer<typeof updatePartyLicenseSchema>;
export type CreatePartyTaxInput = z.infer<typeof createPartyTaxRegistrationSchema>;
export type UpdatePartyTaxInput = z.infer<typeof updatePartyTaxRegistrationSchema>;
export type UpsertFinanceProfileInput = z.infer<typeof upsertPartyFinanceProfileSchema>;
export type CreatePartyContactInput = z.infer<typeof createPartyContactSchema>;
export type UpdatePartyContactInput = z.infer<typeof updatePartyContactSchema>;
export type CreatePartyAddressInput = z.infer<typeof createPartyAddressSchema>;
export type UpdatePartyAddressInput = z.infer<typeof updatePartyAddressSchema>;
export type CreatePartyBankDetailInput = z.infer<typeof createPartyBankDetailSchema>;
export type UpdatePartyBankDetailInput = z.infer<typeof updatePartyBankDetailSchema>;
export type CreatePartyDocumentInput = z.infer<typeof createPartyDocumentSchema>;
export type UpdatePartyDocumentInput = z.infer<typeof updatePartyDocumentSchema>;
