import {expect,it} from 'vitest';
import {addServiceAssignmentSchema,addServiceAssignmentContract,removeServiceAssignmentContract,serviceAssignmentReceipt} from '@/lib/master-data/party-service-assignment-contract';
const values={party_id:1,service_category_id:2,is_primary:false,remarks:'  Notes  '};
const operationId='5e6a4fad-ad32-4c77-9774-78411fbdb954';
it('preserves false and trims optional remarks',()=>{expect(addServiceAssignmentSchema.parse(values)).toEqual({...values,remarks:'Notes'});});
it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'2',null])('rejects invalid assignment IDs %j',value=>{expect(addServiceAssignmentSchema.safeParse({...values,party_id:value}).success).toBe(false);expect(addServiceAssignmentSchema.safeParse({...values,service_category_id:value}).success).toBe(false);});
it.each([{created_by:1},{is_active:false},{id:2},{workspace_revision:1},{is_primary:'false'},{remarks:'x'.repeat(4001)}])('rejects protected/invalid payload %j',patch=>{expect(addServiceAssignmentSchema.safeParse({...values,...patch}).success).toBe(false);});
it('requires null create revision and an exact remove parent/revision',()=>{
 expect(addServiceAssignmentContract.safeParse({operationId,revision:'1'}).success).toBe(false);
 expect(removeServiceAssignmentContract.safeParse({operationId,partyId:1,revision:null}).success).toBe(false);
 expect(removeServiceAssignmentContract.safeParse({operationId,revision:'1'}).success).toBe(false);
 expect(removeServiceAssignmentContract.parse({operationId,partyId:1,revision:'2'}).revision).toBe('2');
});
it.each(['abc','0','-1','1.0','9223372036854775808','1'.repeat(100)])('rejects invalid revision without throwing %s',revision=>{expect(removeServiceAssignmentContract.safeParse({operationId,partyId:1,revision}).success).toBe(false);});
it('requires complete typed, parent-bound receipts',()=>{const receipt={id:4,party_id:1,service_category_id:2,revision:'2',is_active:false,changed:true,replayed:false};expect(serviceAssignmentReceipt.parse(receipt)).toEqual(receipt);expect(serviceAssignmentReceipt.safeParse({...receipt,party_id:undefined}).success).toBe(false);});
