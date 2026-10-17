import {z} from 'zod';
import {aiEndpoint} from './provider-endpoints';

const code=z.string().regex(/^[A-Z0-9_]{1,100}$/, 'Use 1–100 uppercase letters, numbers or underscores.');
const nullableText=(max:number)=>z.string().max(max).nullable().optional();
const email=z.string().email('Enter a valid email address.').max(254).nullable().optional();
const reservedJson=z.record(z.string(),z.unknown()).refine(v=>Object.keys(v).length===0,'Additional provider configuration is not supported. Never put credentials here.').nullable().optional();
const common={provider_name:z.string().trim().min(1,'Provider name is required.').max(200),is_default:z.boolean(),is_enabled:z.boolean(),is_active:z.boolean(),config_json:reservedJson};
const emailBase=z.object({
 ...common,provider_code:code,
 provider_type:z.enum(['microsoft_graph','smtp','sendgrid','mailgun','aws_ses','local_dev','custom']),
 tenant_id:z.string().uuid('Enter the tenant UUID.').nullable().optional(),client_id:z.string().uuid('Enter the client UUID.').nullable().optional(),
 authority_url:nullableText(500),graph_base_url:nullableText(500),sender_email:email,sender_display_name:nullableText(200),reply_to_email:email,
 auth_mode:z.enum(['client_credentials','certificate','delegated_future']),send_mode:z.enum(['graph_send_mail','smtp_future']),
 default_recipient_for_tests:email,throttle_per_minute:z.number().int().min(1).max(2147483647).nullable().optional(),daily_send_limit:z.number().int().min(1).max(2147483647).nullable().optional(),notes:nullableText(2000),
}).strict();
const aiBase=z.object({
 ...common,config_code:code,
 provider_type:z.enum(['openai','azure_openai','azure_document_intelligence','google_document_ai','aws_textract','tesseract','local_ollama','local_custom']),
 api_endpoint:z.string().url('Enter a valid provider URL.').max(500).nullable().optional(),model_id:nullableText(200),api_version:z.string().regex(/^\d{4}-\d{2}-\d{2}(-preview)?$/,'Use YYYY-MM-DD or YYYY-MM-DD-preview.').nullable().optional(),
 purpose:z.enum(['general','chat','ocr','classification','extraction','embedding','dms','assistant']),
 requires_human_review:z.boolean(),confidence_threshold:z.number().min(0).max(1),notes:nullableText(1000),
}).strict();
export const emailProviderCreateSchema=emailBase.extend({is_default:z.boolean().default(false),is_enabled:z.boolean().default(false),is_active:z.boolean().default(true),auth_mode:emailBase.shape.auth_mode.default('client_credentials'),send_mode:emailBase.shape.send_mode.default('graph_send_mail')});
export const emailProviderUpdateSchema=emailBase.partial();
const aiCompleteSchema=aiBase.extend({is_default:z.boolean().default(false),is_enabled:z.boolean().default(false),is_active:z.boolean().default(true),requires_human_review:z.boolean().default(true),confidence_threshold:z.number().min(0).max(1).default(0.85)});
export const aiProviderCreateSchema=aiCompleteSchema.superRefine((v,ctx)=>{
 if(v.api_endpoint!=null){try{aiEndpoint(v.provider_type,v.api_endpoint);}catch{ctx.addIssue({code:'custom',path:['api_endpoint'],message:'Use the supported provider endpoint. OpenAI: api.openai.com/v1; Azure: your resource root; Ollama: HTTP localhost or 127.0.0.1 with port 1–65535.'});}}
 if(v.is_enabled&&['azure_openai','azure_document_intelligence'].includes(v.provider_type)&&!v.api_endpoint)ctx.addIssue({code:'custom',path:['api_endpoint'],message:'An Azure resource endpoint is required before enabling.'});
 if(v.is_enabled&&['google_document_ai','aws_textract','local_custom'].includes(v.provider_type))ctx.addIssue({code:'custom',path:['is_enabled'],message:'This adapter is not implemented. Keep the configuration disabled.'});
 if(v.is_default&&!v.is_active)ctx.addIssue({code:'custom',path:['is_default'],message:'Choose a replacement default before deactivating this provider.'});
});
export const aiProviderUpdateSchema=aiBase.partial().extend({id:z.number().int().positive()});
