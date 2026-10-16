import {expect,it} from 'vitest';
import {hrLookupSchemas} from '@/lib/hr/settings-save-contract';
import {hrLookupOptionFields} from '@/lib/hr/lookup-option-fields';
it('rejects entitlement precision that the existing one-decimal database cannot retain',()=>{
 const schema=hrLookupSchemas.hr_leave_types.partial();
 for(const value of [0.01,0.25,12.34])expect(schema.safeParse({default_entitlement_days:value}).success).toBe(false);
 for(const value of [0,0.1,0.3,1.1,12.7,365,null])expect(schema.safeParse({default_entitlement_days:value}).success).toBe(true);
});
it('the native entitlement input explains the actual stored precision through its step',()=>{
 expect(hrLookupOptionFields.hr_leave_types?.find(f=>f.key==='default_entitlement_days')).toMatchObject({step:0.1});
});
