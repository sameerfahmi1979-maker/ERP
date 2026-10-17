'use server';
import {getAuthContext,hasGlobalPermission} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {hrRuleForms,type HrRuleChoices,type HrRuleEntity} from '@/lib/hr/specialized-settings-form';
import type {ActionResult} from './settings';

// Fixed F06 form projections, not a generic table reader or privileged fallback.
const references:Record<string,{table:string;name:string;code:string;company?:boolean;status?:boolean}>={
 required_document_type_id:{table:'hr_identity_document_types',name:'name_en',code:'code'},
 required_training_type_id:{table:'hr_training_types',name:'name_en',code:'code'},
 required_access_card_type_id:{table:'hr_access_card_types',name:'name_en',code:'code'},
 required_medical_record_type_id:{table:'hr_medical_record_types',name:'name_en',code:'code'},
 applies_to_category_id:{table:'hr_employee_categories',name:'name_en',code:'code'},
 applies_to_designation_id:{table:'designations',name:'designation_name_en',code:'designation_code',company:true},
 applies_to_work_site_id:{table:'work_sites',name:'site_name',code:'site_code',company:true,status:true},
 readiness_rule_template_id:{table:'hr_readiness_rule_templates',name:'rule_name_en',code:'rule_code'},
 approval_role_id:{table:'approval_roles',name:'role_name',code:'role_code',company:true},
};
references.employee_category_id=references.applies_to_category_id;
references.designation_id=references.applies_to_designation_id;
references.work_site_id=references.applies_to_work_site_id;
references.training_type_id=references.required_training_type_id;
references.access_card_type_id=references.required_access_card_type_id;
references.medical_record_type_id=references.required_medical_record_type_id;
references.escalation_role_id=references.approval_role_id;

export async function getHrRuleChoices(entity:HrRuleEntity):Promise<ActionResult<HrRuleChoices>>{
 try{
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,'hr.settings.manage')&&!hasGlobalPermission(ctx,'hr.admin'))return{success:false,error:'Global HR configuration permission is required.'};
  if(!Object.hasOwn(hrRuleForms,entity))return{success:false,error:'Invalid HR configuration.'};
  const client=await createClient(),output:HrRuleChoices={};
  // Only the fields in this form are fetched, through the current actor's RLS.
  await Promise.all(hrRuleForms[entity].fields.filter(f=>f.kind==='reference').map(async field=>{
   const spec=references[field.key];if(!spec)throw Error('Unsupported reference');
   const rows:Array<{id:number;label:string}>=[];let after=0;
   for(;;){
    const projection=`id,${spec.name},${spec.code}${spec.company?',owner_company_id,owner_company:owner_companies(legal_name_en)':''}`;
    const query=client.from(spec.table).select(projection).is('deleted_at',null).eq(spec.status?'status':'is_active',spec.status?'active':true).gt('id',after).order('id').limit(200);
    const {data,error}=await query;
    if(error||!data)throw Error('Reference read failed');
    if(!data.length)break;
    for(const item of data){
     const row=item as unknown as Record<string,unknown>;
     if(typeof row.id!=='number'||!Number.isSafeInteger(row.id)||row.id<=after||typeof row[spec.name]!=='string')throw Error('Invalid reference response');
     const company=row.owner_company as {legal_name_en?:string}|null;
     const scope=spec.company?company?.legal_name_en??(row.owner_company_id==null?'Shared across companies':'Company details unavailable'):null;
     rows.push({id:row.id,label:`${row[spec.name]}${row[spec.code]?' · '+row[spec.code]:''}${scope?' — '+scope:''}`});after=row.id;
    }
   }
   output[field.key]=rows;
  }));
  return{success:true,data:output};
 }catch{return{success:false,error:'Reference choices could not load. Retry before saving; your entries are retained.'};}
}
