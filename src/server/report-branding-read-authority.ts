import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {getAuthContextForProfileId, type AuthContext} from '@/lib/rbac/check';
import {canUseApplication, hasPermission} from '@/lib/rbac/scope';
import {brandingPermission, canViewReportBrandingAssets} from '@/lib/branding/asset-permissions';
import {requireBrandingRevision} from '@/lib/branding/issuance-provenance';
import type {ReportBrandingProfile, ReportTemplate} from '@/lib/report-center/types';

const unavailable = () => Error('Report branding is unavailable or not authorized.');
const validId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
// Closed projections: no legacy image URLs, relation embeds, arbitrary columns,
// business records or mutation builders can be requested by a caller.
const profileColumns = 'id,workspace_revision,profile_code,profile_name,profile_type,owner_company_id,watermark_text,theme_primary_color,theme_secondary_color,theme_header_bg_color,theme_header_text_color,legal_name_en,legal_name_ar,trade_name_en,trade_name_ar,address_block_en,address_block_ar,phone,email,website,po_box,trn,trade_license_no,footer_text_en,footer_text_ar,is_default_for_company,is_group_profile,is_neutral_profile,is_active,created_at,updated_at,created_by,updated_by,deleted_at,deleted_by';
const signingColumns = 'signatory_name,signatory_title_en,signatory_title_ar';
const templateColumns = 'id,workspace_revision,template_code,template_name,template_type,branding_profile_id,default_orientation,page_size,font_family,language_mode,show_logo,show_small_logo,show_address,show_trn,show_license,show_signatory,show_stamp,show_watermark,requires_stamp_permission,watermark_text,body_html_en,body_html_ar,custom_css,header_layout_json,footer_layout_json,body_layout_json,style_json,visual_editor_engine,visual_layout_schema_version,visual_layout_updated_at,visual_layout_updated_by,version_no,is_default,is_active,parent_template_id,governance_status,submitted_at,submitted_by,approved_at,approved_by,approval_notes,rejected_at,rejected_by,rejection_reason,published_at,published_by,archived_at,archived_by,archive_reason,security_review_status,security_review_notes,security_review_at,security_review_by,created_at,updated_at,created_by,updated_by,deleted_at,deleted_by';

/** Trusted server entry only. The supplied principal identifies the authenticated
 * request actor or schedule owner; none of its supplied permission claims are used.
 * This read-only boundary deliberately does not depend on an incidental cookie.
 * Interactive Server Actions must still obtain that identity with getAuthContext.
 */
export async function createReportBrandingReadAuthority(principal: AuthContext) {
  const actorId = principal?.profile?.id;
  if (!validId(actorId)) throw unavailable();
  async function refresh() {
    const current = await getAuthContextForProfileId(actorId!);
    if (current.profile?.id !== actorId || !canUseApplication(current) ||
        (!hasPermission(current, 'reports.view') && !hasPermission(current, 'reports.manage'))) throw unavailable();
    return current;
  }
  const ctx = await refresh();
  const db = createAdminClient();
  function requireCompany(companyId: number | null) {
    if ((companyId !== null && !validId(companyId)) || !canViewReportBrandingAssets(ctx, companyId)) throw unavailable();
  }
  async function profile(selector: {id: number} | {code: string} | {companyId: number}): Promise<ReportBrandingProfile | null> {
    let query = db.from('erp_report_branding_profiles').select('id,owner_company_id,is_active,deleted_at,workspace_revision').is('deleted_at', null);
    if ('id' in selector) {
      if (!validId(selector.id)) throw unavailable();
      query = query.eq('id', selector.id);
    } else if ('code' in selector) {
      requireCompany(null);
      query = query.eq('profile_code', selector.code);
    } else {
      requireCompany(selector.companyId);
      query = query.eq('owner_company_id', selector.companyId).eq('is_default_for_company', true);
    }
    const identity = await query.maybeSingle();
    if (identity.error) throw unavailable();
    if (!identity.data) return null;
    const row = identity.data;
    if (!validId(row.id) || !row.is_active || row.deleted_at) throw unavailable();
    if ('code' in selector && row.owner_company_id !== null) throw unavailable();
    const revision = requireBrandingRevision(row.workspace_revision);
    requireCompany(row.owner_company_id);
    const sign = brandingPermission(ctx, 'reports.sign', row.owner_company_id);
    const result = await db.from('erp_report_branding_profiles')
      .select(profileColumns + (sign ? ',' + signingColumns : ''))
      .eq('id', row.id).eq('workspace_revision', revision).eq('is_active', true).is('deleted_at', null).maybeSingle();
    // Supabase cannot infer a dynamic, conditional projection's row type.
    const display = result.data as unknown as ReportBrandingProfile | null;
    if (result.error || !display || display.owner_company_id !== row.owner_company_id) throw unavailable();
    // Legacy URLs are neither selected nor trusted even for a signing principal.
    return {...display, logo_url: null, small_logo_url: null, watermark_url: null, stamp_url: null, signature_url: null,
      signatory_name: sign ? display.signatory_name : null, signatory_title_en: sign ? display.signatory_title_en : null,
      signatory_title_ar: sign ? display.signatory_title_ar : null};
  }
  async function template(selector: {id: number} | {code: string}, expectedCompany?: number | null) {
    let query = db.from('erp_report_templates').select('id,branding_profile_id,is_active,deleted_at,workspace_revision').is('deleted_at', null);
    if ('id' in selector) {
      if (!validId(selector.id)) throw unavailable();
      query = query.eq('id', selector.id);
    } else {
      if (expectedCompany === undefined) throw unavailable();
      requireCompany(expectedCompany);
      query = query.eq('template_code', selector.code);
    }
    const identity = await query.maybeSingle();
    if (identity.error) throw unavailable();
    if (!identity.data) return null;
    const row = identity.data;
    if (!validId(row.id) || !row.is_active || row.deleted_at) throw unavailable();
    const revision = requireBrandingRevision(row.workspace_revision);
    const branding = row.branding_profile_id === null ? null : await profile({id: row.branding_profile_id});
    if (row.branding_profile_id !== null && !branding) throw unavailable();
    const companyId = branding?.owner_company_id ?? null;
    requireCompany(companyId);
    if (expectedCompany !== undefined && companyId !== expectedCompany) throw unavailable();
    let detail = db.from('erp_report_templates').select(templateColumns).eq('id', row.id)
      .eq('workspace_revision', revision).eq('is_active', true).is('deleted_at', null);
    detail = row.branding_profile_id === null ? detail.is('branding_profile_id', null) : detail.eq('branding_profile_id', row.branding_profile_id);
    const result = await detail.maybeSingle();
    if (result.error || !result.data) throw unavailable();
    return {template: result.data as ReportTemplate, profile: branding, companyId};
  }
  async function verifyTemplate(selected: Pick<ReportTemplate, 'id' | 'workspace_revision' | 'branding_profile_id'>) {
    if (!validId(selected.id)) throw unavailable();
    const revision = requireBrandingRevision(selected.workspace_revision);
    const current = await db.from('erp_report_templates').select('id,workspace_revision,is_active,branding_profile_id')
      .eq('id', selected.id).is('deleted_at', null).maybeSingle();
    if (current.error || !current.data?.is_active || current.data.branding_profile_id !== selected.branding_profile_id ||
        requireBrandingRevision(current.data.workspace_revision) !== revision) throw unavailable();
  }
  async function companyDefaultTemplateId(companyId: number, letter: boolean): Promise<number | null> {
    requireCompany(companyId);
    // Only a rendering pointer, not an organization/business-data grant.
    const field = letter ? 'default_letter_template_id' : 'default_report_template_id';
    const result = await db.from('owner_companies').select(field).eq('id', companyId).maybeSingle();
    if (result.error) throw unavailable();
    const id = (result.data as Record<string, unknown> | null)?.[field];
    if (id === null || id === undefined) return null;
    if (!validId(id)) throw unavailable();
    return id;
  }
  return {ctx, refresh, profile, template, verifyTemplate, companyDefaultTemplateId};
}

export type ReportBrandingReadAuthority = Awaited<ReturnType<typeof createReportBrandingReadAuthority>>;
