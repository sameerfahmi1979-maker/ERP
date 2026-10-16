import {expect,it} from 'vitest';
import {hrLookupSchemas,hrLookupTables} from '@/lib/hr/settings-save-contract';
import {hrLookupOptionFields,initialHrLookupOptions,hrLookupOptionPayload} from '@/lib/hr/lookup-option-fields';

for(const entity of hrLookupTables){
 it(entity+': displayed defaults satisfy the entity-specific contract',()=>{
  const input=hrLookupOptionPayload(entity,initialHrLookupOptions(entity));
  expect(hrLookupSchemas[entity].safeParse({code:'F06_OPTIONS',name_en:'Options',is_active:false,sort_order:0,...input}).success).toBe(true);
 });
 it(entity+': absent edit fields are omitted, never replaced with create defaults',()=>{
  const state=initialHrLookupOptions(entity,{code:'F06_LEGACY',name_en:'Legacy'});
  expect(state).toEqual({});expect(hrLookupOptionPayload(entity,state)).toEqual({});
 });
}
it('editing faithfully round-trips false, zero, null, choice and duration values',()=>{
 const examples={hr_leave_types:{is_paid:false,requires_document:true,requires_approval:false,default_entitlement_days:0,reset_basis:'manual',allow_half_day:false},hr_grades:{grade_level:null},hr_training_types:{default_validity_months:6,default_expiry_alert_days:1,requires_provider:false}} as const;
 for(const [entity,row]of Object.entries(examples))expect(hrLookupOptionPayload(entity as keyof typeof examples,initialHrLookupOptions(entity as keyof typeof examples,row))).toEqual(row);
});
it('foreign or protected fields cannot become form options',()=>{
 const state={...initialHrLookupOptions('hr_grades'),is_active:true,created_by:'8',is_paid:false,training_category_id:'2'};
 expect(hrLookupOptionPayload('hr_grades',state)).toEqual({grade_level:null});
});
it('empty required numbers stay invalid rather than becoming zero/default',()=>{
 const input=hrLookupOptionPayload('hr_identity_document_types',{default_expiry_alert_days:''});
 expect(Number.isNaN(input.default_expiry_alert_days)).toBe(true);
 expect(hrLookupSchemas.hr_identity_document_types.partial().safeParse(input).success).toBe(false);
});
it('each exposed option has a unique label and an approved writable schema field',()=>{
 for(const entity of hrLookupTables){const fields=hrLookupOptionFields[entity]??[];expect(new Set(fields.map(f=>f.key)).size).toBe(fields.length);expect(new Set(fields.map(f=>f.label)).size).toBe(fields.length);for(const field of fields)expect(hrLookupSchemas[entity].shape).toHaveProperty(field.key);}
});
