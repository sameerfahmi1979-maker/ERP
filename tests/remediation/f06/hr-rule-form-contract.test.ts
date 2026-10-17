import {it,expect,vi} from 'vitest';
import {loadHrRuleRows,initialHrRuleForm,hrRulePayload,hrRuleForms,hrRuleReferenceLabel,hrRuleTitle,type HrRuleEntity} from '@/lib/hr/specialized-settings-form';
import {hrSpecializedSchemas} from '@/lib/hr/specialized-settings-contract';
it('collects later pages instead of silently dropping record201',async()=>{const list=vi.fn(async({page}:{page:number})=>({success:true,data:{data:Array.from({length:page===1?200:1},(_,i)=>({id:(page-1)*200+i+1})),total:201}}));expect(await loadHrRuleRows(list)).toHaveLength(201);expect(list.mock.calls[1][0]).toEqual({page:2,page_size:200});});
it.each(['failure','empty','duplicate','totalchange','invalidtotal'])('rejects %s instead of claiming a complete list',async mode=>{const list=vi.fn().mockResolvedValueOnce({success:true,data:{data:[{id:1}],total:2}}).mockResolvedValueOnce(mode==='failure'?{success:false}: {success:true,data:{data:mode==='empty'?[]:[{id:mode==='duplicate'?1:2}],total:mode==='totalchange'?3:mode==='invalidtotal'?null:2}});await expect(loadHrRuleRows(list)).rejects.toThrow();});
it.each(Object.keys(hrRuleForms)as HrRuleEntity[])('%s has a control for every schema-supported field',entity=>{expect(hrRuleForms[entity].fields.map(f=>f.key).sort()).toEqual(Object.keys(hrSpecializedSchemas[entity].shape).sort());});
it('preserves explicit false and zero rather than applying truthy defaults',()=>{const r={id:1,is_active:false,is_critical:false,sort_order:0};expect(hrRulePayload('hr_readiness_rule_templates',initialHrRuleForm('hr_readiness_rule_templates',r),r)).toEqual({is_active:false,is_critical:false,sort_order:0});});
it('does not say Unassigned for an assigned but unauthorized reference',()=>{expect(hrRuleReferenceLabel({id:1,is_active:false,approval_role_id:2,approval_role:null},hrRuleForms.hr_approval_workflows.fields.find(f=>f.key==='approval_role_id')!)).toBe('Saved selection (details unavailable)');});
it('matrix action names identify their permitted relationship context',()=>{
 const row={id:6,is_active:false,readiness_rule_template_id:7,readiness_rule:{rule_name_en:'Offshore readiness'},designation_id:3,designation:{designation_name_en:'Engineer',owner_company:{legal_name_en:'Company A'}}};
 expect(hrRuleTitle('hr_role_requirement_matrix',row)).toBe('Role requirement: Offshore readiness · Engineer — Company A');
});
it('site action names identify selected references without claiming unknown scope',()=>{
 expect(hrRuleTitle('hr_site_requirement_matrix',{id:7,is_active:false,work_site_id:null,readiness_rule_template_id:6,readiness_rule:{rule_name_en:'Site readiness'}})).toBe('Site requirement: No work site selected · Site readiness');
 expect(hrRuleTitle('hr_site_requirement_matrix',{id:8,is_active:false,work_site_id:9,work_site:null})).toBe('Site requirement: Saved selection (details unavailable)');
});
