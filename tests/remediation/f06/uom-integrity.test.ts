import {it,expect,vi} from 'vitest';
import {createUnitOfMeasureSchema,createUomCategorySchema,updateUnitOfMeasureSchema,createUomConversionSchema} from '@/features/master-data/uom/validation';
import {validateUomReferences,uomLifecycleMetadata,uomWriteError} from '@/features/master-data/uom/integrity';
import type {SupabaseClient} from '@supabase/supabase-js';
const unit={uom_category_id:1,unit_code:'KG',unit_name_en:'Kilogram',is_base_unit:true,conversion_factor_to_base:1};
it('rejects non-one base factor rather than silently rewriting user input',()=>{
 expect(createUnitOfMeasureSchema.safeParse({...unit,conversion_factor_to_base:7}).success).toBe(false);
 expect(createUnitOfMeasureSchema.parse({...unit,decimal_places:0,allow_fraction:false,is_active:false})).toMatchObject({decimal_places:0,allow_fraction:false,is_active:false});
});
it('strict schemas reject hidden system fields and immutable updates',()=>{
 expect(createUomCategorySchema.safeParse({category_code:'WEIGHT',category_name_en:'Weight',is_system:true}).success).toBe(false);
 for(const field of ['unit_code','uom_category_id','is_system','created_by'])expect(updateUnitOfMeasureSchema.safeParse({id:1,[field]:2}).success).toBe(false);
});
it('finite factors and integer sort are required',()=>{
 for(const factor of [0,-1,NaN,Infinity])expect(createUomConversionSchema.safeParse({from_uom_id:1,to_uom_id:2,conversion_factor:factor}).success).toBe(false);
 expect(createUnitOfMeasureSchema.safeParse({...unit,sort_order:1.5}).success).toBe(false);
});
it('new fixed-ratio rules need a documented basis and do not accept invented formula codes',()=>{
 const conversion={from_uom_id:1,to_uom_id:2,conversion_factor:2};
 expect(createUomConversionSchema.safeParse({...conversion,conversion_formula_code:'DENSITY_GUESS',notes:'Invented formula reference'}).success).toBe(false);
 for(const notes of [null,'','short'])expect(createUomConversionSchema.safeParse({...conversion,conversion_formula_code:'FIXED_RATIO',notes}).success).toBe(false);
 expect(createUomConversionSchema.safeParse({...conversion,conversion_formula_code:'FIXED_RATIO',notes:'Sealed two-unit pack, constant specification.'}).success).toBe(true);
 expect(createUomConversionSchema.safeParse(conversion).success).toBe(true); // Database checks actual categories.
});
it('partial unit validation uses retained base flag before issuing reads',async()=>{
 const from=vi.fn();const result=await validateUomReferences({from} as unknown as SupabaseClient,'units_of_measure',{conversion_factor_to_base:7},{...unit,id:1,is_active:true});
 expect(result?.fieldErrors).toHaveProperty('conversion_factor_to_base');expect(from).not.toHaveBeenCalled();
});
it('unrelated historical edits preserve inactive selections without reselecting them',async()=>{
 const from=vi.fn();expect(await validateUomReferences({from} as unknown as SupabaseClient,'units_of_measure',{notes:'retained'},{...unit,id:1,is_active:false})).toBeNull();expect(from).not.toHaveBeenCalled();
});
it('availability failures fail closed without exposing database messages',async()=>{
 const q={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(async()=>({data:null,error:{message:'private SQL detail'}}))};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);
 const r=await validateUomReferences({from:()=>q} as unknown as SupabaseClient,'units_of_measure',{...unit,is_base_unit:false});expect(r?.success).toBe(false);expect(r?.error).not.toContain('private');
});
it('status metadata preserves unrelated and same-status edits',()=>{
 expect(uomLifecycleMetadata({notes:'text'},{is_active:false},1)).toEqual({});expect(uomLifecycleMetadata({is_active:false},{is_active:false},1)).toEqual({});
 expect(uomLifecycleMetadata({is_active:false},undefined,2)).toMatchObject({deactivated_by:2});expect(uomLifecycleMetadata({is_active:true},{is_active:false},2)).toEqual({deactivated_at:null,deactivated_by:null,deactivation_reason:null});
});
it('mapped errors expose business guidance but not raw internals',()=>{
 expect(uomWriteError({code:'23503',message:'Retire active units before retiring their category'})).toMatch(/Retire the active units/);
 expect(uomWriteError({code:'XX000',message:'private SQL secret'})).not.toContain('private');
});
