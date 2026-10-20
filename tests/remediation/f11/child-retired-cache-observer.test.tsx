// @vitest-environment jsdom
import React from 'react';
import {act,render,cleanup} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
const m=vi.hoisted(()=>({save:vi.fn(),reconcile:vi.fn(),cache:vi.fn(),store:null as ReturnType<typeof createWorkspaceDraftStore>|null}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/server/actions/hr/child-mutation',()=>({mutateHrChild:m.save,reconcileHrChild:m.reconcile}));
import {useComplianceOperationSession} from '@/features/hr/employees/compliance/use-compliance-operation-session';
let session:ReturnType<typeof useComplianceOperationSession>;
function Harness({authority}:{authority:string}){session=useComplianceOperationSession('synthetic-actor',authority,7,'identity-document',m.cache);return <span>{session.retired?'Retired':'Current'}</span>;}
beforeEach(()=>{vi.resetAllMocks();m.store=createWorkspaceDraftStore();});afterEach(cleanup);
function deferred<T>(){let resolve!:(r:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};}
it('cache-only observation never acknowledges or replays a retired save',async()=>{
 const p=deferred<unknown>();m.save.mockReturnValue(p.promise);const view=render(<Harness authority="A"/>);let result!:ReturnType<typeof session.submit>;
 await act(async()=>{result=session.submit({kind:'identity-document',employeeId:7,id:17,revision:'2',action:'update',values:{notes:'PRIVATE_ORIGINAL'}});});
 const operationId=m.save.mock.calls[0][1].operationId;view.rerender(<Harness authority="B"/>);
 const receipt={kind:'identity-document',employee_id:7,id:17,operation_id:operationId,revision:'3',replayed:false};
 await act(async()=>{p.resolve({success:true,data:receipt});});
 expect(await result).toMatchObject({success:false,uncertain:true,retired:true});expect(m.cache).toHaveBeenCalledExactlyOnceWith(receipt);expect(session.receipt).toBeNull();expect(session.retired?.operationId).toBe(operationId);expect(m.save).toHaveBeenCalledTimes(1);expect(m.reconcile).not.toHaveBeenCalled();expect(JSON.stringify(m.cache.mock.calls)).not.toContain('PRIVATE_ORIGINAL');
});
it.each([{employee_id:8},{id:18},{operation_id:'fd75e8ed-01b8-4f22-91d1-2b77fba9b259'},{kind:'medical-record'},{revision:'invalid'}])('foreign/incomplete late receipt %j cannot dirty caches or settle recovery',async altered=>{
 const p=deferred<unknown>();m.save.mockReturnValue(p.promise);const view=render(<Harness authority="A"/>);let result!:ReturnType<typeof session.submit>;
 await act(async()=>{result=session.submit({kind:'identity-document',employeeId:7,id:17,revision:'2',action:'update',values:{notes:'PRIVATE_ORIGINAL'}});});const operationId=m.save.mock.calls[0][1].operationId;
 view.rerender(<Harness authority="B"/>);await act(async()=>{p.resolve({success:true,data:{kind:'identity-document',employee_id:7,id:17,operation_id:operationId,revision:'3',replayed:false,...altered}});});
 expect(await result).toMatchObject({success:false,uncertain:true,retired:true});expect(m.cache).not.toHaveBeenCalled();expect(session.receipt).toBeNull();expect(session.retired?.operationId).toBe(operationId);
});
