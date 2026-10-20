import {it,expect} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import {createChildOperationState,childRecoveryMarkers} from '@/lib/hr/child-operation-state';
import type {ComplianceChildKind} from '@/lib/hr/compliance-child-contract';
import type {ChildMutation,ChildReceipt} from '@/lib/hr/child-save-contract';
const kinds:ComplianceChildKind[]=['identity-document','medical-insurance','access-card','training-certificate','medical-record'];
it.each(kinds)('%s retains original operation/payload and rejects changed retries',kind=>{
 const store=createWorkspaceDraftStore(),request:ChildMutation={kind,employeeId:7,id:17,revision:'2',action:'update',values:{notes:'PRIVATE_COMPLIANCE'}};
 const make=()=>createChildOperationState(store,'synthetic-actor','authority',7,kind),a=make(),p=a.prepare(request),reopened=make();
 expect(reopened.prepare(request)).toEqual(p);expect(()=>reopened.prepare({...request,values:{notes:'CHANGED'}})).toThrow();
 expect(reopened.pending?.contract.operationId).toBe(p.contract.operationId);
});
it.each(kinds)('%s retires private payloads and accepts only its actor-owned opaque receipt',kind=>{
 const store=createWorkspaceDraftStore(),a=createChildOperationState(store,'synthetic-actor','authority-a',7,kind),p=a.prepare({kind,employeeId:7,id:17,revision:'2',action:'update',values:{notes:'PRIVATE_COMPLIANCE',dms_document_id:41}});a.retire();
 expect(store.getViewState(a.key)).not.toContain('PRIVATE_COMPLIANCE');expect(store.getViewState(a.key)).not.toContain('dms_document_id');
 const b=createChildOperationState(store,'synthetic-actor','authority-b',7,kind);expect(b.blocked).toBe(true);expect(childRecoveryMarkers(store,'other-actor')).toEqual([]);
 const receipt:ChildReceipt={kind,employee_id:7,id:17,revision:'3',operation_id:p.contract.operationId,replayed:true};
 expect(()=>b.reconcile({...receipt,employee_id:8})).toThrow();expect(b.retired).not.toBeNull();b.reconcile(receipt);expect(b.pending).toBeNull();expect(b.receipt).toEqual(receipt);
});
it.each(kinds)('%s allocates a new batch operation only after confirmed settlement',kind=>{
 const store=createWorkspaceDraftStore(),a=createChildOperationState(store,'synthetic-actor','authority',7,kind),request:ChildMutation={kind,employeeId:7,id:17,revision:'2',action:'update',values:{notes:'Synthetic'}};
 const p=a.prepare(request);expect(a.startNew()).toBe(false);a.accept({kind,employee_id:7,id:17,revision:'3',operation_id:p.contract.operationId,replayed:false});expect(a.startNew()).toBe(true);
 expect(a.prepare({...request,id:18}).contract.operationId).not.toBe(p.contract.operationId);
});
