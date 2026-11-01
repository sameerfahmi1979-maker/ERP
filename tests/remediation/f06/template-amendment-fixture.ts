import type {ReportTemplate} from '@/lib/report-center/types';
import type {TemplateAmendmentReceipt} from '@/lib/report-center/template-amendment';
export const publishedTemplate:ReportTemplate={id:42,workspace_revision:'3',template_code:'QA_SAME_TEMPLATE',template_name:'Synthetic published template',
 template_type:'letter',branding_profile_id:null,default_orientation:'portrait',page_size:'a4',font_family:'Inter',language_mode:'bilingual',
 show_logo:true,show_small_logo:false,show_address:true,show_trn:true,show_license:true,show_signatory:false,show_stamp:false,show_watermark:false,
 requires_stamp_permission:false,watermark_text:null,body_html_en:'<p>Original</p>',body_html_ar:null,custom_css:null,
 header_layout_json:{},footer_layout_json:{},body_layout_json:{},style_json:{},visual_editor_engine:null,visual_layout_schema_version:1,
 visual_layout_updated_at:null,visual_layout_updated_by:null,version_no:1,is_default:true,is_active:true,parent_template_id:null,
 governance_status:'published',submitted_at:null,submitted_by:null,approved_at:null,approved_by:null,approval_notes:null,
 rejected_at:null,rejected_by:null,rejection_reason:null,published_at:'2026-10-30T00:00:00Z',published_by:1,archived_at:null,archived_by:null,archive_reason:null,
 security_review_status:'passed',security_review_notes:null,security_review_at:null,security_review_by:null,created_at:'2026-10-30T00:00:00Z',updated_at:'2026-10-30T00:00:00Z',
 created_by:1,updated_by:1,deleted_at:null,deleted_by:null};
export function amendmentState(status:NonNullable<TemplateAmendmentReceipt['amendment']>['status']|null=null):TemplateAmendmentReceipt{
 return {id:42,revision:status?'4':'3',changed:false,replayed:false,owner_company_id:null,
  template:status?{...publishedTemplate,template_name:'Proposed template',governance_status:status==='discarded'?'published':status,workspace_revision:'4'}:publishedTemplate,
  published_template:publishedTemplate,amendment:status?{status,base_revision:'3',author_id:1,approved_by:null,review:null}:null};
}
