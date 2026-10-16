import {expect,it} from 'vitest';
import {serviceCategorySchema,serviceCategoryUpdateSchema,relationshipTypeSchema,relationshipTypeUpdateSchema} from '@/lib/master-data/party-admin-master-contract';
it.each([
 [serviceCategorySchema,{category_code:'TEST',category_name_en:' Name ',is_active:false,sort_order:0}],
 [relationshipTypeSchema,{relationship_code:'TEST',name_en:' Name ',is_active:false,sort_order:0}],
] as const)('preserves deliberate false/zero values and trims names',(schema,payload)=>{
 const parsed=schema.parse(payload);expect(parsed).toMatchObject({is_active:false,sort_order:0});expect(JSON.stringify(parsed)).toContain('"Name"');
});
it.each([{}, {is_system:false}, {id:7}, {created_by:1}, {workspace_revision:4}, {sort_order:null}, {sort_order:1.5}, {sort_order:-1}, {sort_order:2147483648}, {is_active:'false'}])('rejects protected or invalid update %j',payload=>{
 expect(serviceCategoryUpdateSchema.safeParse(payload).success).toBe(false);expect(relationshipTypeUpdateSchema.safeParse(payload).success).toBe(false);
});
it.each([{category_code:'lower'},{category_name_en:' '},{category_name_en:'x'.repeat(201)},{parent_category_id:0},{parent_category_id:Number.MAX_SAFE_INTEGER+1},{description:'x'.repeat(2001)}])('rejects invalid category %j',payload=>expect(serviceCategoryUpdateSchema.safeParse(payload).success).toBe(false));
it('partial updates do not inject create defaults',()=>{
 expect(serviceCategoryUpdateSchema.parse({description:null})).toEqual({description:null});
 expect(relationshipTypeUpdateSchema.parse({name_en:' Changed '})).toEqual({name_en:'Changed'});
});
