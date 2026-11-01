import {z} from 'zod';
import {canUseApplication} from '@/lib/rbac/scope';
import type {AuthContext} from '@/lib/rbac/check';
import type {ReportTemplate} from './types';
import {templateReviewSchema} from './template-governance-receipt';

/** This special editing capability is not inherited by company/branch administrators. */
export function canEditPublishedTemplate(ctx:AuthContext):boolean {
  return canUseApplication(ctx) && !!ctx.roleAssignments?.some(a =>
    a.roleCode==='system_admin' && a.ownerCompanyId===null && a.branchId===null);
}
export const amendmentActions=['save','submit','approve','reject','publish','withdraw','discard'] as const;
export type TemplateAmendmentAction=typeof amendmentActions[number];
const id=z.number().int().positive(),nullableId=id.nullable(),text=z.string().nullable();
const templateProjection:z.ZodType<ReportTemplate>=z.object({id,template_code:z.string(),template_name:z.string(),
  workspace_revision:z.union([z.string().regex(/^[1-9]\d*$/),id]),
  template_type:z.enum(['report','letter','certificate','form','checklist','badge','external_submission','group_summary']),
  branding_profile_id:nullableId,default_orientation:z.enum(['portrait','landscape']),page_size:z.enum(['a4','letter','legal']),
  font_family:z.string(),language_mode:z.enum(['en','ar','bilingual']),show_logo:z.boolean(),show_small_logo:z.boolean(),
  show_address:z.boolean(),show_trn:z.boolean(),show_license:z.boolean(),show_signatory:z.boolean(),show_stamp:z.boolean(),show_watermark:z.boolean(),
  requires_stamp_permission:z.boolean(),watermark_text:text,body_html_en:text,body_html_ar:text,custom_css:text,
  header_layout_json:z.record(z.string(),z.unknown()),footer_layout_json:z.record(z.string(),z.unknown()),
  body_layout_json:z.record(z.string(),z.unknown()),style_json:z.record(z.string(),z.unknown()),
  visual_editor_engine:text,visual_layout_schema_version:nullableId,visual_layout_updated_at:text,visual_layout_updated_by:nullableId,
  version_no:id,is_default:z.boolean(),is_active:z.boolean(),parent_template_id:nullableId,
  governance_status:z.enum(['draft','in_review','approved','published','archived','rejected']),
  submitted_at:text,submitted_by:nullableId,approved_at:text,approved_by:nullableId,approval_notes:text,
  rejected_at:text,rejected_by:nullableId,rejection_reason:text,published_at:text,published_by:nullableId,
  archived_at:text,archived_by:nullableId,archive_reason:text,
  security_review_status:z.enum(['pending','passed','failed','skipped']),security_review_notes:text,security_review_at:text,security_review_by:nullableId,
  created_at:z.string(),updated_at:z.string(),created_by:nullableId,updated_by:nullableId,deleted_at:text,deleted_by:nullableId,
}).passthrough();
export const templateAmendmentReceipt=z.object({
  id:z.number().int().positive(),revision:z.string().regex(/^[1-9]\d*$/),
  changed:z.boolean(),replayed:z.boolean(),owner_company_id:z.number().int().positive().nullable(),
  amendment:z.object({
    status:z.enum(['draft','in_review','approved','rejected','published','discarded']),
    base_revision:z.string().regex(/^[1-9]\d*$/),author_id:z.number().int().positive(),
    approved_by:z.number().int().positive().nullable(),review:templateReviewSchema.nullable(),
  }).nullable(),
  template:templateProjection,published_template:templateProjection,
});
export type TemplateAmendmentReceipt=z.infer<typeof templateAmendmentReceipt>;
