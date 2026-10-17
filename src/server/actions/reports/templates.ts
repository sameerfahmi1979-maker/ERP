"use server";

/**
 * Global ERP Report Center — Template & Branding Profile Server Actions
 * Phase: REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Full CRUD for erp_report_templates and erp_report_branding_profiles.
 * All write actions require reports.manage permission.
 * All read actions require reports.view or reports.manage.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { brandingPermission, canViewReportBrandingAssets, canManageReportBrandingAssets, canUploadBrandingAssets } from "@/lib/branding/asset-permissions";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { hasGlobalPermission } from "@/lib/rbac/scope";
import {getEmployeeAccess} from "@/lib/rbac/employee-access";
import {requireReportTemplateCapability,requireTemplateBrandingCapability} from "@/server/report-template-authority";
import type { ReportTemplate, ReportBrandingProfile } from "@/lib/report-center/types";
import type { ExportBrandingContext } from "@/lib/export/export-types";
import { resolveReportBrandingProfileAssetUrls } from "@/lib/branding/resolve-report-branding-assets";
import { saveBrandingMutation } from "@/server/branding-save";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import type { WorkspaceSaveResult } from "@/server/workspace-save";
import {saveTemplateConfiguration} from "@/server/template-configuration-save";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

// ─────────────────────────────────────────────────────────────────────────────
// Projection type for the template selection dialog
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportTemplateForSelection {
  id: number;
  template_code: string;
  template_name: string;
  template_type: string;
  is_default: boolean;
  governance_status: string;
  branding_profile_id: number | null;
  branding_profile_name: string | null;
  branding_profile_type: string | null;
  company_name: string | null;
  logo_url: string | null;
  /** Visual editor engine — "puck" if template has visual layout (DESIGNER.6) */
  visual_editor_engine: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────────────────

// The shared legacy admin client is not schema-parameterized. Validate this joined
// projection at its boundary instead of asserting `any` or treating a FK as an array.
const selectionRowsSchema = z.array(z.object({
  id: z.number(),
  template_code: z.string(),
  template_name: z.string(),
  template_type: z.string(),
  is_default: z.boolean().nullable(),
  governance_status: z.string().nullable(),
  visual_editor_engine: z.string().nullable(),
  branding_profile_id: z.number().nullable(),
  branding_profile: z.object({
    profile_name: z.string(),
    profile_type: z.string(),
    logo_url: z.string().nullable(),
    owner_company: z.object({ legal_name_en: z.string() }).nullable(),
  }).nullable(),
}));

const updateTemplateSchema = z.object({
  id: z.number().int().positive(),
  template_name: z.string().trim().min(2).max(200),
  template_type: z.enum(['report','letter','certificate','form','checklist','badge','external_submission','group_summary']),
  default_orientation: z.enum(["portrait", "landscape"]).optional(),
  page_size: z.enum(["a4", "letter", "legal"]).optional(),
  font_family: z.string().trim().min(1).max(100).optional(),
  language_mode: z.enum(["en", "ar", "bilingual"]).optional(),
  show_logo: z.boolean().optional(),
  show_small_logo: z.boolean().optional(),
  show_address: z.boolean().optional(),
  show_trn: z.boolean().optional(),
  show_license: z.boolean().optional(),
  show_signatory: z.boolean().optional(),
  show_stamp: z.boolean().optional(),
  show_watermark: z.boolean().optional(),
  watermark_text: z.string().max(100).nullable().optional(),
  body_html_en: z.string().max(1000000).nullable().optional(),
  body_html_ar: z.string().max(1000000).nullable().optional(),
  custom_css: z.string().max(50000).nullable().optional(),
  branding_profile_id: z.number().int().positive().nullable().optional(),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
}).strict();

const createTemplateSchema = updateTemplateSchema.omit({ id: true }).extend({
  template_code: z.string().min(2).max(100).regex(/^[A-Z0-9_]+$/, "Code must be UPPER_SNAKE_CASE"),
  template_name: z.string().min(2).max(200),
  template_type: z.string(),
});

const updateBrandingProfileSchema = z.object({
  id: z.number().int().positive(),
  profile_name: z.string().trim().min(2).max(200),
  profile_type: z.enum(["company", "group", "neutral", "custom"]).optional(),
  owner_company_id: z.number().int().positive().nullable().optional(),
  logo_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  small_logo_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  stamp_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  signature_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  watermark_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  watermark_text: z.string().max(100).nullable().optional(),
  theme_primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color").optional(),
  theme_secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color").optional(),
  theme_header_bg_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color").optional(),
  theme_header_text_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color").optional(),
  legal_name_en: z.string().max(300).nullable().optional(),
  legal_name_ar: z.string().max(300).nullable().optional(),
  trade_name_en: z.string().max(300).nullable().optional(),
  trade_name_ar: z.string().max(300).nullable().optional(),
  address_block_en: z.string().max(500).nullable().optional(),
  address_block_ar: z.string().max(500).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("").transform(() => null)),
  website: z.string().max(200).nullable().optional(),
  po_box: z.string().max(50).nullable().optional(),
  trn: z.string().max(50).nullable().optional(),
  trade_license_no: z.string().max(100).nullable().optional(),
  footer_text_en: z.string().max(500).nullable().optional(),
  footer_text_ar: z.string().max(500).nullable().optional(),
  signatory_name: z.string().max(200).nullable().optional(),
  signatory_title_en: z.string().max(200).nullable().optional(),
  signatory_title_ar: z.string().max(200).nullable().optional(),
  is_default_for_company: z.boolean().optional(),
  is_group_profile: z.boolean().optional(),
  is_neutral_profile: z.boolean().optional(),
  is_active: z.boolean().optional(),
}).strict();

const createBrandingProfileSchema = updateBrandingProfileSchema.omit({ id: true }).extend({
  profile_code: z.string().min(2).max(100).regex(/^[A-Z0-9_]+$/, "Code must be UPPER_SNAKE_CASE"),
  profile_name: z.string().min(2).max(200),
});

// ─────────────────────────────────────────────────────────────────────────────
// Template read actions
// ─────────────────────────────────────────────────────────────────────────────

export async function listReportTemplates(): Promise<ActionResult<ReportTemplate[]>> {
  try {
    const ctx=await getAuthContext();
    if(!hasPermission(ctx,"reports.view")&&!hasPermission(ctx,"reports.manage"))return {success:false,error:"You do not have permission to view report templates."};
    const db=await createClient(),rows:ReportTemplate[]=[];
    // Existing catalogue contract, complete bounded pages. PERF owns the common adapter.
    for(let cursor=0;;){
      const r=await db.from("erp_report_templates").select("*").is("deleted_at",null).gt("id",cursor).order("id").limit(200);
      if(r.error||!r.data)throw Error("Template catalogue read failed");
      if(r.data.length===0)break;
      for(const row of r.data){
        if(!Number.isSafeInteger(row.id)||row.id<=cursor)throw Error("Invalid template order");
        cursor=row.id;rows.push(row as ReportTemplate);
      }
    }
    return {success:true,data:rows.sort((a,b)=>a.template_name.localeCompare(b.template_name)||a.id-b.id)};
  }catch{return {success:false,error:"Report templates could not be loaded. Retry the request."};}
}

export async function getReportTemplate(id:number):Promise<ActionResult<ReportTemplate>>{
  try{
    const ctx=await getAuthContext();
    if(!Number.isSafeInteger(id)||id<1||(!hasPermission(ctx,"reports.view")&&!hasPermission(ctx,"reports.manage")))return {success:false,error:"Template unavailable or not authorized."};
    const db=await createClient();
    const r=await db.from("erp_report_templates").select("*").eq("id",id).is("deleted_at",null).maybeSingle();
    if(r.error)return {success:false,error:"Template could not be loaded. Retry the request."};
    if(!r.data)return {success:false,error:"Template unavailable or not authorized."};
    return {success:true,data:r.data as ReportTemplate};
  }catch{return {success:false,error:"Template could not be loaded. Retry the request."};}
}

/** Branding choices never authorize business records; both retain independent scopes. */
export async function listReportTemplatesForSelection(input?:{
  ownerCompanyIds?:number[];
  issuableOnly?:boolean;
}):Promise<ActionResult<ReportTemplateForSelection[]>>{
  try{
    const options=z.object({ownerCompanyIds:z.array(z.number().int().positive()).max(1000).optional(),issuableOnly:z.boolean().optional()}).strict().safeParse(input??{});
    if(!options.success)return {success:false,error:"Invalid template selection filters."};
    const catalogue=await listReportTemplates();
    if(!catalogue.success||!catalogue.data)return {success:false,error:catalogue.error??"Template choices could not be loaded."};
    const candidates=catalogue.data.filter(t=>t.is_active&&(!options.data.issuableOnly||["approved","published"].includes(t.governance_status)));
    const ids=[...new Set(candidates.flatMap(t=>t.branding_profile_id==null?[]:[t.branding_profile_id]))];
    const db=await createClient(),profiles=new Map<number,ReportBrandingProfile>();
    for(let offset=0;offset<ids.length;offset+=100){
      const batch=ids.slice(offset,offset+100);
      // Keyset continuation also handles Data API caps smaller than this batch.
      for(let cursor=0;;){
        const r=await db.from("erp_report_branding_profiles_safe").select("*").in("id",batch).gt("id",cursor).order("id").limit(100);
        if(r.error||!r.data)throw Error("Template branding choices unavailable");
        if(r.data.length===0)break;
        for(const row of r.data){
          if(!Number.isSafeInteger(row.id)||row.id<=cursor)throw Error("Invalid branding order");
          cursor=row.id;profiles.set(row.id,row as ReportBrandingProfile);
        }
      }
    }
    const rows:ReportTemplateForSelection[]=[];
    for(const t of candidates){
      const p=t.branding_profile_id==null?null:profiles.get(t.branding_profile_id);
      if(t.branding_profile_id!=null&&(!p||!p.is_active||p.deleted_at))continue;
      const wanted=options.data.ownerCompanyIds;
      if(wanted?.length&&p?.owner_company_id!=null&&!wanted.includes(p.owner_company_id))continue;
      const projected=selectionRowsSchema.safeParse([{
        id:t.id,template_code:t.template_code,template_name:t.template_name,template_type:t.template_type,
        is_default:t.is_default,governance_status:t.governance_status,visual_editor_engine:t.visual_editor_engine??null,
        branding_profile_id:t.branding_profile_id,
        branding_profile:p?{profile_name:p.profile_name,profile_type:p.profile_type,logo_url:p.logo_url,
          owner_company:p.owner_company_id==null?null:{legal_name_en:p.legal_name_en??p.trade_name_en??p.profile_name}}:null,
      }]);
      if(!projected.success)throw Error("Invalid template selection response");
      const row=projected.data[0];
      rows.push({id:row.id,template_code:row.template_code,template_name:row.template_name,template_type:row.template_type,
        is_default:row.is_default??false,governance_status:row.governance_status??"draft",
        branding_profile_id:row.branding_profile_id,branding_profile_name:row.branding_profile?.profile_name??null,
        branding_profile_type:row.branding_profile?.profile_type??null,company_name:row.branding_profile?.owner_company?.legal_name_en??null,
        logo_url:row.branding_profile?.logo_url??null,visual_editor_engine:row.visual_editor_engine});
    }
    return {success:true,data:rows.sort((a,b)=>Number(b.is_default)-Number(a.is_default)||a.template_name.localeCompare(b.template_name)||a.id-b.id)};
  }catch{return {success:false,error:"Template choices or branding could not be loaded. Retry before selecting."};}
}

// ─────────────────────────────────────────────────────────────────────────────
// Template write actions
// ─────────────────────────────────────────────────────────────────────────────

export async function createReportTemplate(
  input: z.infer<typeof createTemplateSchema>,contract?:WorkspaceSaveContract
): Promise<WorkspaceSaveResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "You do not have permission to manage report templates." };
    }
    const parsed = createTemplateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const companyId=await requireTemplateBrandingCapability(ctx,parsed.data.branding_profile_id??null,['reports.manage']);
    if((parsed.data.show_stamp||parsed.data.show_signatory)&&!brandingPermission(ctx,'reports.sign',companyId))return {success:false,error:"Signing authority is required to enable a stamp or signatory."};
    return saveTemplateConfiguration(null,parsed.data,contract);
  } catch {
    return { success: false, error: "Template creation unavailable or not authorized." };
  }
}

export async function updateReportTemplate(
  input: z.infer<typeof updateTemplateSchema>,contract?:WorkspaceSaveContract
): Promise<WorkspaceSaveResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "You do not have permission to manage report templates." };
    }
    const parsed = updateTemplateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const { id, ...rest } = parsed.data;
    const authority=await requireReportTemplateCapability(ctx,id,['reports.manage']);
    if(Object.hasOwn(rest,'branding_profile_id')){
      const nextCompany=await requireTemplateBrandingCapability(ctx,rest.branding_profile_id??null,['reports.manage']);
      if(nextCompany!==authority.companyId)return {success:false,error:"A template cannot move to another issuing company. Create a separate template instead."};
    }
    if(((rest.show_stamp===true&&!authority.template.show_stamp)||(rest.show_signatory===true&&!authority.template.show_signatory))&&!brandingPermission(ctx,'reports.sign',authority.companyId))return {success:false,error:"Signing authority is required to enable a stamp or signatory."};
    // BRANDING.8 guard: block in-place edits of approved/published templates
    const existing=authority.template;

    if (
      existing?.governance_status === "approved" ||
      existing?.governance_status === "published"
    ) {
      return {
        success: false,
        error: `Template "${existing.template_code}" is ${existing.governance_status} and cannot be edited directly. Use "Create New Version" to make a new draft with your changes.`,
      };
    }

    return saveTemplateConfiguration(id,rest,contract);
  } catch {
    return { success: false, error: "Template update unavailable or not authorized." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Branding profile read actions
// ─────────────────────────────────────────────────────────────────────────────

export async function listBrandingProfiles(): Promise<ActionResult<ReportBrandingProfile[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.view") && !hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "You do not have permission to view branding profiles." };
    }
    const db = await createClient();
    // Complete this existing scoped catalogue without a silently capped first
    // page. This is not a shared read/cache adapter; PERF owns that integration.
    // Continue until an empty page so a lower Data API limit cannot truncate it.
    const profiles:ReportBrandingProfile[]=[];
    const assetMap = new Map<number, Set<string>>();
    await Promise.all([
      (async()=>{for(let cursor=0;;){
        const r=await db.from("erp_report_branding_profiles_safe").select("*").gt("id",cursor).order("id").limit(200);
        if(r.error||!r.data)throw Error("Branding profiles unavailable");
        if(r.data.length===0)break;
        for(const row of r.data){
          if(!Number.isSafeInteger(row.id)||row.id<=cursor)throw Error("Invalid branding catalogue order");
          cursor=row.id;profiles.push(row as ReportBrandingProfile);
        }
      }})(),
      (async()=>{for(let cursor=0;;){
        const r=await db.from("erp_branding_assets").select("id,branding_profile_id,asset_type")
          .eq("asset_scope","report").eq("is_active",true).is("deleted_at",null).gt("id",cursor).order("id").limit(200);
        if(r.error||!r.data)throw Error("Branding assets unavailable");
        if(r.data.length===0)break;
        for(const a of r.data){
          if(!Number.isSafeInteger(a.id)||a.id<=cursor)throw Error("Invalid asset catalogue order");
          cursor=a.id;if(a.branding_profile_id==null)continue;
          const types=assetMap.get(a.branding_profile_id)??new Set<string>();
          types.add(a.asset_type);assetMap.set(a.branding_profile_id,types);
        }
      }})(),
    ]);
    return { success: true, data: profiles.sort((a,b)=>a.profile_name.localeCompare(b.profile_name)||a.id-b.id).map(p => {
      const types = assetMap.get(p.id);
      const canSign = brandingPermission(ctx, "reports.sign", p.owner_company_id);
      return {
        ...(p as ReportBrandingProfile),
        has_report_logo: !!(types?.has("report_logo") || p.logo_url),
        has_small_logo: !!(types?.has("report_logo_small") || p.small_logo_url),
        has_stamp: canSign ? !!(types?.has("stamp") || p.stamp_url) : undefined,
        has_signature: canSign ? !!(types?.has("signature") || p.signature_url) : undefined,
        can_sign: canSign,
        can_manage: canManageReportBrandingAssets(ctx, p.owner_company_id),
        can_approve: brandingPermission(ctx,"reports.template.approve",p.owner_company_id),
        can_publish: brandingPermission(ctx,"reports.publish",p.owner_company_id)||brandingPermission(ctx,"reports.template.approve",p.owner_company_id),
        can_upload_assets: canManageReportBrandingAssets(ctx, p.owner_company_id) && canUploadBrandingAssets(ctx, p.owner_company_id),
      };
    }) };
  } catch {
    return { success: false, error: "Branding profiles could not be loaded." };
  }
}

export async function getBrandingProfile(id: number): Promise<ActionResult<ReportBrandingProfile>> {
  try {
    const ctx = await getAuthContext();
    if (!Number.isSafeInteger(id) || id < 1 || (!hasPermission(ctx, "reports.view") && !hasPermission(ctx, "reports.manage"))) {
      return { success: false, error: "Branding profile is unavailable or not authorized." };
    }
    const db = await createClient();
    const { data, error } = await db.from("erp_report_branding_profiles_safe").select("*").eq("id", id).maybeSingle();
    if (error) return { success: false, error: "Branding profile could not be loaded." };
    if (!data) return { success: false, error: "Branding profile is unavailable or not authorized." };
    const assets = await db.from("erp_branding_assets").select("asset_type")
      .eq("asset_scope", "report").eq("branding_profile_id", id).eq("is_active", true).is("deleted_at", null);
    if (assets.error || !assets.data) return { success: false, error: "Branding asset availability could not be loaded. Retry before making changes." };
    const types = new Set(assets.data.map(a => a.asset_type));
    const canSign = brandingPermission(ctx, "reports.sign", data.owner_company_id);
    return { success: true, data: {
      ...(data as ReportBrandingProfile),
      has_report_logo: types.has("report_logo") || !!data.logo_url,
      has_small_logo: types.has("report_logo_small") || !!data.small_logo_url,
      has_stamp: canSign ? types.has("stamp") || !!data.stamp_url : undefined,
      has_signature: canSign ? types.has("signature") || !!data.signature_url : undefined,
      can_sign: canSign,
      can_manage: canManageReportBrandingAssets(ctx, data.owner_company_id),
      can_approve: brandingPermission(ctx,"reports.template.approve",data.owner_company_id),
      can_publish: brandingPermission(ctx,"reports.publish",data.owner_company_id)||brandingPermission(ctx,"reports.template.approve",data.owner_company_id),
      can_upload_assets: canManageReportBrandingAssets(ctx, data.owner_company_id) && canUploadBrandingAssets(ctx, data.owner_company_id),
    } };
  } catch {
    return { success: false, error: "Branding profile could not be loaded." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Branding profile write actions
// ─────────────────────────────────────────────────────────────────────────────

export async function getBrandingEditorChoices(): Promise<ActionResult<{
  companies: { id: number; company_code: string; legal_name_en: string; can_sign: boolean }[];
  canCreateGlobal: boolean;
  canSignGlobal: boolean;
}>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) return {success:false,error:"Branding management permission is required."};
    const db = await createClient();
    const company=z.object({id:z.number().int().positive(),company_code:z.string(),legal_name_en:z.string(),can_sign:z.boolean()});
    const companies:z.infer<typeof company>[]=[];
    for(let cursor=0;;){
      const {data,error}=await db.from("erp_branding_company_choices").select("id,company_code,legal_name_en,can_sign").gt("id",cursor).order("id").limit(200);
      const parsed=z.array(company).max(200).safeParse(data);
      if(error||!parsed.success)return {success:false,error:"Issuing companies could not be loaded. Retry before saving."};
      if(parsed.data.length===0)break;
      for(const row of parsed.data){if(row.id<=cursor)throw Error("Invalid company catalogue order");cursor=row.id;companies.push(row);}
    }
    companies.sort((a,b)=>a.legal_name_en.localeCompare(b.legal_name_en)||a.id-b.id);
    return {success:true,data:{companies,canCreateGlobal:hasGlobalPermission(ctx,"reports.manage"),canSignGlobal:hasGlobalPermission(ctx,"reports.sign")}};
  } catch {return {success:false,error:"Issuing companies could not be loaded. Retry before saving."};}
}

export async function createBrandingProfile(
  input: z.infer<typeof createBrandingProfileSchema>,
  contract?: WorkspaceSaveContract
): Promise<WorkspaceSaveResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "You do not have permission to manage branding profiles." };
    }
    const parsed = createBrandingProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    return await saveBrandingMutation("report", null, parsed.data, contract);
  } catch {
    return { success: false, uncertain: true, error: "Save unconfirmed. Retry the unchanged entries." };
  }
}

export async function updateBrandingProfile(
  input: z.infer<typeof updateBrandingProfileSchema>,
  contract?: WorkspaceSaveContract
): Promise<WorkspaceSaveResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "You do not have permission to manage branding profiles." };
    }
    const parsed = updateBrandingProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const { id, ...rest } = parsed.data;
    return await saveBrandingMutation("report", id, rest, contract);
  } catch {
    return { success: false, uncertain: true, error: "Save unconfirmed. Retry the unchanged entries." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Template preview resolution (for UI preview panels)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a template into a client-safe ExportBrandingContext for preview/output.
 * Reports code is optional — passed for display purposes only.
 */
export async function resolveTemplatePreview(input: {
  templateId: number;
  reportCode?: string;
}): Promise<ActionResult<ExportBrandingContext>> {
  try {
    const ctx = await getAuthContext();
    if (!Number.isSafeInteger(input.templateId)||input.templateId<1||(!hasPermission(ctx, "reports.view")&&!hasPermission(ctx,"reports.manage"))) {
      return { success: false, error: "You do not have permission." };
    }
    const selected=await getReportTemplate(input.templateId);
    if(!selected.success||!selected.data)return {success:false,error:selected.error??"Template preview unavailable."};
    const tpl=selected.data;
    if(!tpl||!tpl.is_active||tpl.deleted_at)return {success:false,error:"This template is inactive or unavailable."};
    const db=await createClient();
    const profile=tpl.branding_profile_id==null?null:await db.from("erp_report_branding_profiles_safe").select("*").eq("id",tpl.branding_profile_id).maybeSingle();
    if(profile?.error)return {success:false,error:"Template branding could not be loaded."};
    const bp=profile?.data as ReportBrandingProfile|null|undefined;
    // The selected letterhead is an independently governed resource, never a
    // grant to the employee/report data selected elsewhere in the request.
    if((tpl.branding_profile_id!=null&&!bp)||(bp&&(!bp.is_active||bp.deleted_at))||
      !canViewReportBrandingAssets(ctx,bp?.owner_company_id??null)){
      return {success:false,error:"This template's branding is unavailable or not authorized."};
    }

    const assetUrls =
      bp?.id != null
        ? await resolveReportBrandingProfileAssetUrls(bp.id, ctx)
        : {};

    const canSign = brandingPermission(ctx, "reports.sign", bp?.owner_company_id ?? null);

    const resolved: ExportBrandingContext = {
      companyNameEn: bp?.legal_name_en ?? bp?.trade_name_en ?? null,
      companyNameAr: bp?.legal_name_ar ?? bp?.trade_name_ar ?? null,
      // Logo — prefer erp_branding_assets, fall back to legacy column
      logoUrl: tpl.show_logo
        ? (assetUrls.report_logo ?? bp?.logo_url ?? null)
        : null,
      // Small logo — prefer asset, fall back to legacy
      smallLogoUrl: tpl.show_small_logo
        ? (assetUrls.report_logo_small ?? bp?.small_logo_url ?? null)
        : null,
      // Stamp — only resolve when template shows stamp AND caller has reports.sign
      stampUrl:
        tpl.show_stamp && canSign
          ? (assetUrls.stamp ?? bp?.stamp_url ?? null)
          : null,
      // Signature — only resolve when template shows signatory AND caller has reports.sign
      signatureUrl:
        tpl.show_signatory && canSign
          ? (assetUrls.signature ?? bp?.signature_url ?? null)
          : null,
      // Watermark image — prefer asset, fall back to legacy
      watermarkUrl: tpl.show_watermark
        ? (assetUrls.watermark ?? bp?.watermark_url ?? null)
        : null,
      // Letterhead background — only from new asset system
      letterheadBackgroundUrl: assetUrls.letterhead_background ?? null,
      addressBlockEn: bp?.address_block_en ?? null,
      phone: bp?.phone ?? null,
      email: bp?.email ?? null,
      website: bp?.website ?? null,
      trn: bp?.trn ?? null,
      tradeLicenseNo: bp?.trade_license_no ?? null,
      footerTextEn: bp?.footer_text_en ?? null,
      signatoryName: canSign ? bp?.signatory_name ?? null : null,
      signatoryTitleEn: canSign ? bp?.signatory_title_en ?? null : null,
      themePrimaryColor: bp?.theme_primary_color ?? null,
      themeHeaderBgColor: bp?.theme_header_bg_color ?? null,
      themeHeaderTextColor: bp?.theme_header_text_color ?? null,
      showLogo: tpl.show_logo,
      showAddress: tpl.show_address,
      showTrn: tpl.show_trn,
      showLicense: tpl.show_license,
      showSignatory: tpl.show_signatory && canSign,
      showStamp: tpl.show_stamp && canSign,
      showWatermark: tpl.show_watermark,
      watermarkText: tpl.watermark_text ?? bp?.watermark_text ?? null,
      reportCode: input.reportCode ?? null,
      templateName: tpl.template_name,
      isGroupProfile: bp?.is_group_profile ?? false,
      isNeutralProfile: bp?.is_neutral_profile ?? false,
      templateOrientation: tpl.default_orientation,
    };

    return { success: true, data: resolved };
  } catch {
    return { success: false, error: "Template preview could not be loaded. Retry or ask an authorized administrator to review its branding." };
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// renderVisualTemplateForLetterPreview  (REPORT DESIGNER.6)
// ─────────────────────────────────────────────────────────────────────────────

export interface RenderVisualTemplateResult {
  ok: boolean;
  hasVisualLayout: boolean;
  html?: string;
  warnings?: string[];
  error?: string;
}

/**
 * Render a visual template layout for an official letter/certificate preview.
 *
 * Used by LetterPreviewDialog when the selected template has a Puck visual layout.
 * Falls back gracefully when no valid visual layout exists.
 *
 * SAFETY:
 *  - No QR token creation
 *  - No erp_output_public_links writes
 *  - No erp_report_runs writes
 *  - No emails
 *  - Read-only DB access (template + branding + employee data)
 *
 * Requires: reports.view or reports.manage
 * For employee data: also requires hr.employees.view
 */
export async function renderVisualTemplateForLetterPreview(input: {
  templateId: number;
  employeeId?: number;
  ownerCompanyId?: number;
}): Promise<RenderVisualTemplateResult> {
  try {
    const authCtx = await getAuthContext();
    if (!hasPermission(authCtx, "reports.view") && !hasPermission(authCtx, "reports.manage")) {
      return { ok: false, hasVisualLayout: false, error: "Insufficient permissions" };
    }

    const { templateId, employeeId, ownerCompanyId } = input;
    if(!Number.isSafeInteger(templateId)||templateId<1||
      (employeeId!==undefined&&(!Number.isSafeInteger(employeeId)||employeeId<1))||
      (ownerCompanyId!==undefined&&(!Number.isSafeInteger(ownerCompanyId)||ownerCompanyId<1))){
      return {ok:false,hasVisualLayout:false,error:"Invalid preview selection."};
    }

    // Validate stored company/branch/employee relationships independently of the
    // template. Management of branding alone never grants employee-data access.
    const employeeAccess=employeeId===undefined?null:await getEmployeeAccess(authCtx,employeeId);
    if(employeeAccess&&(!employeeAccess.allows('reports.view')&&!employeeAccess.allows('reports.manage'))){
      return {ok:false,hasVisualLayout:false,error:"Employee preview is unavailable or not authorized."};
    }
    if(employeeAccess&&ownerCompanyId!==undefined&&ownerCompanyId!==employeeAccess.subject.owner_company_id){
      return {ok:false,hasVisualLayout:false,error:"The data company must match the selected employee. Letterhead selection does not change data ownership."};
    }
    if(!employeeAccess&&ownerCompanyId!==undefined&&!canViewReportBrandingAssets(authCtx,ownerCompanyId)){
      return {ok:false,hasVisualLayout:false,error:"Company preview is unavailable or not authorized."};
    }

    const brandingResult=await resolveTemplatePreview({templateId});
    if(!brandingResult.success||!brandingResult.data)return {ok:false,hasVisualLayout:false,error:brandingResult.error??"Template branding unavailable."};

    // Load template with layout zones
    const db = createAdminClient();
    const { data: tpl, error: tplErr } = await db
      .from("erp_report_templates")
      .select(
        "id,template_name,template_code,template_type,governance_status," +
        "visual_editor_engine," +
        "header_layout_json,body_layout_json,footer_layout_json"
      )
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (tplErr || !tpl) {
      return { ok: false, hasVisualLayout: false, error: tplErr?.message ?? "Template not found" };
    }

    const template = tpl as unknown as {
      id: number;
      template_name: string;
      template_code: string;
      template_type: string;
      governance_status: string;
      visual_editor_engine: string | null;
      header_layout_json: unknown;
      body_layout_json: unknown;
      footer_layout_json: unknown;
    };

    // DESIGNER.7: Production visual rendering is only allowed for approved/published templates.
    // Test Report in Reports Editor may still render draft layouts (it calls runReportDesignerTest
    // which has no governance gate — by design, it is an explicit test/preview-only path).
    const PRODUCTION_ISSUABLE: string[] = ["approved", "published"];
    if (!PRODUCTION_ISSUABLE.includes(template.governance_status)) {
      return {
        ok: true,
        hasVisualLayout: false,
        // Not an error — caller falls back to legacy rendering
      };
    }

    // Check if template has visual layout
    const { templateHasVisualLayout, renderVisualTemplateZones } =
      await import("@/lib/report-designer/production-renderer");

    if (!templateHasVisualLayout(template)) {
      return { ok: true, hasVisualLayout: false };
    }

    const branding = brandingResult.data;

    // Resolve binding values
    const {
      resolveEmployeeBindingValues,
      resolveOwnerCompanyBindingValues: resolveCompanyBindings,
      resolveDocumentBindingValues,
      redactDesignerTestBindingValues,
    } = await import("@/lib/report-designer/test-data-resolver");
    const { buildSampleBindingValues } = await import("@/lib/report-designer");

    let bindingValues: Record<string, string> = buildSampleBindingValues();
    const allWarnings: string[] = [];

    // Authenticated reads retain the database's live per-employee and sensitive
    // table rules, including revocation after the preliminary context check.
    const dataClient=await createClient();
    if (employeeId&&employeeAccess) {
        const empResult = await resolveEmployeeBindingValues(employeeId, dataClient);
        allWarnings.push(...empResult.warnings);
        bindingValues = { ...bindingValues, ...empResult.values };

        const coId = employeeAccess.subject.owner_company_id;
        if (coId) {
          const coResult = await resolveCompanyBindings(coId, dataClient);
          allWarnings.push(...coResult.warnings);
          bindingValues = { ...bindingValues, ...coResult.values };
        }
    } else if (ownerCompanyId) {
      const coResult = await resolveCompanyBindings(ownerCompanyId, dataClient);
      allWarnings.push(...coResult.warnings);
      bindingValues = { ...bindingValues, ...coResult.values };
    }

    // Document metadata bindings
    const docBindings = resolveDocumentBindingValues({
      templateName: template.template_name,
      templateCode: template.template_code,
    });
    bindingValues = { ...bindingValues, ...docBindings };

    // ── Sensitive field resolution ────────────────────────────────────────────
    // If the user has reports.sensitive_fields.use (or is erp.admin), resolve
    // real values for restricted/confidential fields in "official" mode.
    // Otherwise fall back to test-mode masking.
    const canUseSensitiveFields = employeeAccess?.allows("reports.sensitive_fields.use")===true;

    if (canUseSensitiveFields && employeeId) {
      const { resolveOfficialSensitiveFields } = await import(
        "@/lib/report-designer/sensitive-field-masking"
      );
      const { REPORT_FIELD_REGISTRY } = await import(
        "@/lib/report-designer/field-registry"
      );
      const allPaths = REPORT_FIELD_REGISTRY.map((f) => f.fieldPath);
      const sensitiveResult = await resolveOfficialSensitiveFields({
        employeeId,
        requestedPaths: allPaths,
        context: {
          outputMode: "official",
          userPermissions: employeeAccess!.scopedContext.permissionCodes,
          templateType: template.template_type,
          governanceStatus: template.governance_status,
        },
        supabase: dataClient,
        auditMeta: {
          templateId: template.id,
          templateCode: template.template_code,
          issuedByProfileId: authCtx.profile?.id ? String(authCtx.profile.id) : null,
        },
      });
      // Official values overwrite the masked placeholders from the base resolver
      bindingValues = { ...bindingValues, ...sensitiveResult.values };
      allWarnings.push(...sensitiveResult.warnings);
    } else {
      // Test mode — mask all restricted/confidential fields
      const redactResult = redactDesignerTestBindingValues(bindingValues);
      bindingValues = redactResult.values;
    }

    // Render via production renderer
    const renderResult = renderVisualTemplateZones({
      templateName: template.template_name,
      templateType: template.template_type,
      headerLayoutRaw: template.header_layout_json,
      bodyLayoutRaw: template.body_layout_json,
      footerLayoutRaw: template.footer_layout_json,
      branding,
      bindingValues,
    });

    allWarnings.push(...renderResult.warnings);

    return {
      ok: true,
      hasVisualLayout: renderResult.hasVisualLayout,
      html: renderResult.html,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
    };
  } catch {
    return {
      ok: false,
      hasVisualLayout: false,
      error: "Preview unavailable. Check your access to the employee, company and selected branding, or retry the request.",
    };
  }
}
