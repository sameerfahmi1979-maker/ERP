// @vitest-environment jsdom
import '../f05/setup';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
const m=vi.hoisted(()=>({list:vi.fn(),metrics:vi.fn(),retry:vi.fn(),detail:vi.fn(),toast:vi.fn(),owner:{identity:{authUserId:'a',scopeVersion:'1'},generation:0,isLive:()=>true}}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>m.owner}));
vi.mock('@/server/actions/output/ops-console',()=>({listOpsIssuances:m.list,getOpsMetrics:m.metrics,retryOpsIssuance:m.retry,getOpsIssuanceDetail:m.detail,cancelOpsIssuance:vi.fn()}));
vi.mock('@/server/actions/output/issuance-history',()=>({revokeIssuance:vi.fn()}));
vi.mock('sonner',()=>({toast:{error:m.toast,success:m.toast,warning:m.toast}}));
vi.mock('@/components/erp/page-header',()=>({ERPPageHeader:({actions}:{actions:ReactNode})=><header>{actions}</header>}));
vi.mock('@/components/ui/button',()=>({Button:({children,variant:_,size:__,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string;size?:string})=><button {...props}>{children}</button>}));
vi.mock('@/components/ui/badge',()=>({Badge:({children}:{children:ReactNode})=><span>{children}</span>}));
vi.mock('@/components/erp/erp-child-dialog-form',()=>({ERPChildDialogForm:({open,children,title,subtitle,onSubmit,submitLabel,isSubmitting}:{open:boolean;title:string;subtitle:string;children:ReactNode;onSubmit:()=>void;submitLabel:string;isSubmitting:boolean})=>open?<section><h2>{title}</h2><p>{subtitle}</p><form onSubmit={e=>{e.preventDefault();onSubmit();}}>{children}{submitLabel&&<button disabled={isSubmitting}>{submitLabel}</button>}</form></section>:null}));
vi.mock('@/components/erp/table/list-controls',()=>({ConfiguredRow:({children}:{children:ReactNode})=><tr>{children}</tr>,EditColumns:()=>null,EditFilters:()=>null,useListColumns:(_key:string,columns:unknown[])=>({columns,visible:columns,setColumns:vi.fn()})}));
import {OutputOpsConsole} from '@/features/output-ops/output-ops-console';
const row={id:7,output_code:'F08_QA',template_key:'qa',document_class:'G',lifecycle_state:'rendering',serial_no:'F08-7',serial_status:'reserved',owner_company_id:1,source_record_type:'employee',source_record_id:1,generated_at:'2026-10-18T00:00:00Z',total_duration_ms:null,qr_status:null};
beforeEach(()=>{vi.resetAllMocks();m.owner={identity:{authUserId:'a',scopeVersion:'1'},generation:0,isLive:()=>true};m.list.mockResolvedValue({success:true,data:{rows:[row],total:1,canRetry:true,canRevoke:false}});m.metrics.mockResolvedValue({success:true,data:{rendererHealthy:true,issuedLast24h:0,failedLast24h:0,avgRenderMsLast24h:0,stuckInFlight:[],reconciliationRequired:[],voidedSerials:0,stateCounts:{},scheduleRuns:{succeededLast24h:0,retryable:0,terminal:0,terminalRecent:[]}}});m.retry.mockResolvedValue({success:true,data:{outcome:{success:true,issuanceId:7,serialNo:'F08-7',qr:{status:'not_requested'}}}});});
afterEach(cleanup);
async function recovery(){fireEvent.click(await screen.findByRole('button',{name:'Recover original'}));await screen.findByText('Recover Original Issuance');fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'Synthetic interrupted request'}});fireEvent.submit(screen.getByLabelText('Reason').closest('form')!);}
it('interrupted rows offer recovery of the same original, never promise a fresh issuance',async()=>{
 render(<OutputOpsConsole/>);await recovery();await waitFor(()=>expect(m.retry).toHaveBeenCalledWith({issuanceId:7,reason:'Synthetic interrupted request'}));expect(m.toast).toHaveBeenCalledWith('Original recovered',expect.objectContaining({description:expect.stringContaining('Same issuance #7')}));expect(m.toast.mock.calls.flat().join(' ')).not.toContain('New issuance');
});
it('pending QR activation offers recovery without regenerating the issued original',async()=>{m.list.mockResolvedValue({success:true,data:{rows:[{...row,lifecycle_state:'issued',qr_status:'pending_activation'}],total:1,canRetry:true,canRevoke:false}});render(<OutputOpsConsole/>);expect(await screen.findByRole('button',{name:'Recover original'})).toBeTruthy();});
it('retirement suppresses a late old-account recovery acknowledgement',async()=>{
 let resolve!:(r:unknown)=>void;m.retry.mockReturnValue(new Promise(r=>{resolve=r;}));const view=render(<OutputOpsConsole/>);await recovery();await waitFor(()=>expect(m.retry).toHaveBeenCalled());const old=m.owner;old.isLive=()=>false;m.owner={identity:{authUserId:'b',scopeVersion:'2'},generation:0,isLive:()=>true};view.rerender(<OutputOpsConsole/>);
 await act(async()=>resolve({success:true,data:{outcome:{success:true,issuanceId:7,qr:{status:'not_requested'}}}}));expect(m.toast).not.toHaveBeenCalled();
});
it('read failures remove mutation controls instead of treating stale history as current',async()=>{m.list.mockResolvedValue({success:false,error:'Unavailable'});render(<OutputOpsConsole/>);await screen.findByRole('alert');expect(screen.queryByRole('button',{name:'Recover original'})).toBeNull();});
