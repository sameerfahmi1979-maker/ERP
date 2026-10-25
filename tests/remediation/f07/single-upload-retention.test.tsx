// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
const m=vi.hoisted(()=>({store:null as ReturnType<typeof createWorkspaceDraftStore>|null,owner:'synthetic-workspace',readOwner:null as {identity:{authUserId:string};isLive:()=>boolean;admits:()=>boolean}|null,live:true}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:m.owner})}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>m.readOwner}));
import {useDmsSingleUploadAdmission} from '@/hooks/use-dms-single-upload-admission';
const metadata={original_filename:'synthetic.pdf',mime_type:'application/pdf',file_size_bytes:40,sha256_hash:'a'.repeat(64)};
beforeEach(()=>{m.live=true;m.owner='synthetic-workspace';m.store=createWorkspaceDraftStore();m.readOwner={identity:{authUserId:'a7000000-0000-4000-8000-000000000001'},isLive:()=>m.live,admits:()=>m.live};});
afterEach(cleanup);
it('retry and remount keep the exact original operation without retaining capabilities or bytes',()=>{const first=renderHook(()=>useDmsSingleUploadAdmission());const run=first.result.current.begin(metadata);run.settled();first.unmount();const second=renderHook(()=>useDmsSingleUploadAdmission());const retry=second.result.current.begin(metadata);expect(retry.request).toEqual(run.request);const raw=m.store!.getDraft('draft:tab:synthetic-workspace:f07-single-upload:null')!.request;expect(JSON.parse(raw)).toEqual(run.request);expect(raw).not.toMatch(/token|signedUrl|password|session_id/);});
it('a different file cannot replace an uncertain request',()=>{const {result}=renderHook(()=>useDmsSingleUploadAdmission());result.current.begin(metadata).settled();expect(()=>result.current.begin({...metadata,sha256_hash:'b'.repeat(64)})).toThrow(/earlier upload/);});
it('only confirmed completion releases retention for a new upload',()=>{const {result}=renderHook(()=>useDmsSingleUploadAdmission());const first=result.current.begin(metadata);expect(first.confirmed()).toBe(true);first.settled();const second=result.current.begin(metadata);expect(second.request.operationId).not.toBe(first.request.operationId);});
it('simultaneous clicks cannot dispatch a second operation',()=>{const {result}=renderHook(()=>useDmsSingleUploadAdmission());result.current.begin(metadata);expect(()=>result.current.begin(metadata)).toThrow(/progress/);});
it('retired owner cannot publish a stale reply or clear the new owner draft',()=>{const {result,rerender}=renderHook(()=>useDmsSingleUploadAdmission());const run=result.current.begin(metadata);m.live=false;act(()=>rerender());expect(run.isCurrent()).toBe(false);expect(run.confirmed()).toBe(false);expect(()=>result.current.begin(metadata)).toThrow(/ownership/);});
it('same component context change permanently retires the prior activation',()=>{const {result,rerender}=renderHook(({id})=>useDmsSingleUploadAdmission({entityType:'employee',entityId:id}),{initialProps:{id:1}});const run=result.current.begin(metadata);act(()=>rerender({id:2}));expect(run.isCurrent()).toBe(false);expect(run.confirmed()).toBe(false);});
it('corrupt retention and failed storage never dispatch',()=>{const {result}=renderHook(()=>useDmsSingleUploadAdmission());m.store!.setDraft('draft:tab:synthetic-workspace:f07-single-upload:null',{request:'invalid'});expect(()=>result.current.begin(metadata)).toThrow();expect(m.store!.getDraft('draft:tab:synthetic-workspace:f07-single-upload:null')!.request).toBe('invalid');});
it('reload recovery durably adopts only the exact server-retained original identity',()=>{const {result}=renderHook(()=>useDmsSingleUploadAdmission());const run=result.current.begin(metadata);const original={...run.request,operationId:'d7000000-0000-4000-8000-000000000001'};expect(run.recover(original)).toBe(true);expect(run.request).toEqual(original);expect(run.isCurrent()).toBe(true);expect(()=>run.recover({...original,context:{entityType:'employee',entityId:1}})).toThrow(/differs/);run.settled();expect(result.current.begin(metadata).request).toEqual(original);});

it('selected company is frozen with the original file and operation',()=>{
 const {result}=renderHook(()=>useDmsSingleUploadAdmission(null,{companyId:7,branchId:8}));const run=result.current.begin(metadata);
 expect(run.request.scope).toEqual({companyId:7,branchId:8});expect(run.request.context).toBeNull();expect(result.current.pending).toBe(true);expect(result.current.retainedScope).toEqual({companyId:7,branchId:8});
 expect(()=>run.recover({...run.request,scope:{companyId:9,branchId:null}})).toThrow();run.settled();
});
it('company changes cannot redirect a pending upload or erase the original',()=>{
 const {result,rerender}=renderHook(({company})=>useDmsSingleUploadAdmission(null,{companyId:company,branchId:null}),{initialProps:{company:7}});
 const run=result.current.begin(metadata);run.settled();act(()=>rerender({company:8}));expect(run.isCurrent()).toBe(false);
 expect(()=>result.current.begin(metadata)).toThrow(/earlier upload/);expect(result.current.retainedScope).toEqual({companyId:7,branchId:null});
});
it('remount without a new company selection retains original explicit scope',()=>{
 const first=renderHook(()=>useDmsSingleUploadAdmission(null,{companyId:7,branchId:null}));const run=first.result.current.begin(metadata);run.settled();first.unmount();
 const second=renderHook(()=>useDmsSingleUploadAdmission());expect(second.result.current.begin(metadata).request).toEqual(run.request);
});
