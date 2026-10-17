import {describe,it,expect} from 'vitest';
import {lookupCommandSchema,verifyLookupReceipt,lookupWriteError,type LookupCommand} from '@/features/master-data/lookups/mutation-contract';
import {createLookupCategorySchema,updateLookupCategorySchema,createLookupValueSchema,updateLookupValueSchema} from '@/features/master-data/lookups/validation';
import {lookupCapabilities} from '@/features/master-data/lookups/permissions';
import type {AuthContext} from '@/lib/rbac/check';
const operationId='11111111-1111-4111-8111-111111111111';
const command:LookupCommand={kind:'value',action:'default',categoryId:8,categoryRevision:'3',data:{}};
const contract={operationId,revision:'4'};
const receipt={kind:'value',action:'default',operation_id:operationId,id:9,revision:'5',category_id:8,category_revision:'4',changed:true,replayed:false};
describe('lookup original identity and revision receipts',()=>{
 it('accepts a complete changed original and the same committed replay',()=>{expect(verifyLookupReceipt(receipt,9,command,contract)).toEqual(receipt);expect(verifyLookupReceipt({...receipt,replayed:true},9,command,contract).replayed).toBe(true);});
 it('accepts a true no-op with unchanged target AND parent revisions',()=>{expect(verifyLookupReceipt({...receipt,changed:false,revision:'4',category_revision:'3'},9,command,contract).changed).toBe(false);});
 it.each([{id:10},{kind:'category'},{action:'lock'},{operation_id:'22222222-2222-4222-8222-222222222222'},{revision:'6'},{category_id:7},{category_revision:'5'},{changed:undefined},{id:Number.MAX_SAFE_INTEGER+1},{private_payload:'must never be accepted'}])('rejects substituted/incomplete receipt %#',patch=>expect(()=>verifyLookupReceipt({...receipt,...patch},9,command,contract)).toThrow());
 it('accepts category creation at exactly revision1 with matching own category',()=>expect(verifyLookupReceipt({...receipt,kind:'category',action:'save',id:21,revision:'1',category_id:21,category_revision:'1'},null,{kind:'category',action:'save',categoryId:null,categoryRevision:null,data:{}},{operationId,revision:null}).id).toBe(21));
 it('rejects a creation receipt that claims no change',()=>expect(()=>verifyLookupReceipt({...receipt,kind:'category',action:'save',id:21,revision:'1',category_id:21,category_revision:'1',changed:false},null,{kind:'category',action:'save',categoryId:null,categoryRevision:null,data:{}},{operationId,revision:null})).toThrow('creation receipt'));
 it('rejects a non-save action presented as creation',()=>expect(()=>verifyLookupReceipt({...receipt,kind:'category',action:'lock',id:21,revision:'1',category_id:21,category_revision:'1'},null,{kind:'category',action:'lock',categoryId:null,categoryRevision:null,data:{}},{operationId,revision:null})).toThrow('creation receipt'));
 it.each([{categoryId:null},{categoryRevision:null},{categoryRevision:'0'},{categoryId:1.5},{categoryRevision:'9007199254740992'}])('rejects incomplete original parent %#',patch=>expect(lookupCommandSchema.safeParse({...command,...patch}).success).toBe(false));
});
describe('strict writable payloads',()=>{
 it('preserves typed false and zero',()=>expect(createLookupCategorySchema.parse({category_code:'QA_TEST',category_name_en:'Synthetic',supports_metadata:false,is_active:false,sort_order:0})).toMatchObject({supports_metadata:false,is_active:false,sort_order:0}));
 it.each(['is_default','is_locked','is_system','created_by','workspace_revision'])('cannot smuggle %s through an ordinary value save',key=>expect(createLookupValueSchema.safeParse({category_id:8,value_code:'QA',value_label_en:'Synthetic',[key]:true}).success).toBe(false));
 it.each(['category_code','created_by','is_system','is_locked'])('cannot mutate protected category field %s',key=>expect(updateLookupCategorySchema.safeParse({id:8,[key]:'QA'}).success).toBe(false));
 it('does not synthesize omitted value metadata, hierarchy or dates on update',()=>expect(updateLookupValueSchema.parse({id:9,value_label_en:'Renamed'})).toEqual({id:9,value_label_en:'Renamed'}));
 it.each(['2026-02-30','2026-13-01','2026-1-1','not a date'])('rejects invalid date %s',effective_from=>expect(updateLookupValueSchema.safeParse({id:9,effective_from}).success).toBe(false));
 it('rejects zero IDs and inverted calendar dates',()=>{expect(createLookupValueSchema.safeParse({category_id:0,value_code:'QA',value_label_en:'QA'}).success).toBe(false);expect(updateLookupValueSchema.safeParse({id:9,effective_from:'2026-10-15',effective_to:'2026-10-14'}).success).toBe(false);});
});
describe('global lookup catalogue capabilities',()=>{
 const base={profile:{id:1,must_change_password:false},isAccountActive:true,roleAssignments:[],roleCodes:[],permissionCodes:[],globalPermissionCodes:[]} as unknown as AuthContext;
 it('recognizes a genuine global admin without manufactured permission links',()=>expect(lookupCapabilities({...base,roleAssignments:[{roleCode:'system_admin',ownerCompanyId:null,branchId:null,permissionCodes:[]}]})).toEqual({read:true,manage:true,lock:true}));
 it.each(['view','manage','lock'])('admits global %s to catalogue but preserves operation differences',cap=>{const r=lookupCapabilities({...base,globalPermissionCodes:[`master_data.lookups.${cap}`]});expect(r.read).toBe(true);expect(r.manage).toBe(cap==='manage');expect(r.lock).toBe(cap==='lock');});
 it('does not treat company-only capability or required-password profile as global authority',()=>{expect(lookupCapabilities({...base,permissionCodes:['master_data.lookups.manage']})).toEqual({read:false,manage:false,lock:false});expect(lookupCapabilities({...base,globalPermissionCodes:['master_data.lookups.manage'],profile:{...base.profile!,must_change_password:true}}).read).toBe(false);});
});
it.each(['42501','PT404','PT409','23505','22023','23514','40001','40P01'])('classifies %s as this invocation definite rejection without SQL text',code=>{expect(lookupWriteError(code).uncertain).toBe(false);expect(lookupWriteError(code).error).not.toContain(code);});
it.each(['40003','57014','08006',undefined,'UNKNOWN'])('retains completion-unknown for %s',code=>expect(lookupWriteError(code).uncertain).toBe(true));
