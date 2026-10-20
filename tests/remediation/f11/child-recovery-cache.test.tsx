// @vitest-environment jsdom
import React from 'react';
import{afterEach,expect,it,vi}from 'vitest';
import{cleanup,fireEvent,render,screen,waitFor}from '@testing-library/react';
import{QueryClient,QueryClientProvider}from '@tanstack/react-query';
import{syntheticAuthContext}from '../../performance/fixtures/auth-context';
import{HR_ACTION_RECORD_CONFIG}from '@/lib/reads/hr-action-records-schema';
const m=vi.hoisted(()=>({recent:vi.fn()}));
vi.mock('@/server/actions/hr/child-mutation',()=>({listRecentHrChildReceipts:m.recent,reconcileHrChild:vi.fn()}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>null}));
vi.mock('@/components/ui/button',()=>({Button:({variant,...p}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string})=><button data-variant={variant}{...p}/>}));
import{HrChildRecoveryPanel}from '@/features/hr/employees/hr-child-recovery-panel';
const clients:QueryClient[]=[];afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());vi.resetAllMocks();});
it.each([{kind:'pro-process',read:'pro',action:'update'},{kind:'hr-action',read:'actions',action:'close'},{kind:'performance',read:'performance',action:'approve'},{kind:'disciplinary',read:'disciplinary',action:'acknowledge'},{kind:'approval',read:'approvals',action:'approve'},{kind:'eos-case',read:'eos',action:'set-status'}]as const)('$kind confirmed recovery invalidates the real reader family, without a fetch or another employee change',async({kind,read,action})=>{
 const client=new QueryClient();clients.push(client);const identity='synthetic-current-identity';
 const global=['hr','actions',kind==='eos-case'?'global-eos-cases':kind==='approval'?'global-approvals':'global-disciplinary',identity,{page:1}],key=['hr','actions',HR_ACTION_RECORD_CONFIG[read].prefix,7,{page:1,pageSize:25},identity],otherEmployee=['hr','actions',HR_ACTION_RECORD_CONFIG[read].prefix,8,{page:1,pageSize:25},identity],otherKind=['hr','actions','notes',7,{page:1,pageSize:25},identity],overview=['hr','employees','overview',7,identity];
 for(const k of[key,otherEmployee,otherKind,overview,global])client.setQueryData(k,{synthetic:true});const fetch=vi.fn();client.setQueryDefaults(['hr'],{queryFn:fetch});
 m.recent.mockResolvedValue({success:true,rows:[{kind,action,id:51,employee_id:7,operation_id:'8b978ff7-6b6c-43ab-9474-fe6453f08301',revision:'2',replayed:true,created_at:'2026-10-19T04:00:00Z'}],nextCursor:null});
 render(<QueryClientProvider client={client}><HrChildRecoveryPanel authContext={syntheticAuthContext(kind==='eos-case'?['hr.eos.view','hr.eos.manage']:['hr.actions.view','hr.actions.manage','hr.confidential.view','hr.confidential.manage'])}/></QueryClientProvider>);
 fireEvent.click(screen.getByText('Find recent confirmed child changes'));await screen.findByText('Recent confirmed HR child changes');
 await waitFor(()=>expect(client.getQueryState(key)?.isInvalidated).toBe(true));expect(client.getQueryState(overview)?.isInvalidated).toBe(true);expect(client.getQueryState(otherEmployee)?.isInvalidated).toBe(false);expect(client.getQueryState(otherKind)?.isInvalidated).toBe(false);expect(fetch).not.toHaveBeenCalled();expect(client.getQueryState(global)?.isInvalidated).toBe(kind==='disciplinary'||kind==='approval'||kind==='eos-case');
 expect(screen.getByText(new RegExp(action==='set-status'?'Status changed':action==='close'?'Closed':action==='approve'?'Approved':action==='acknowledge'?'Acknowledgement recorded':'Updated'))).toBeTruthy();
});
