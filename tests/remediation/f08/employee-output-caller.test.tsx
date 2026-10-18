// @vitest-environment jsdom
import '../f05/setup';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { AuthContext } from '@/lib/rbac/check';
const m=vi.hoisted(()=>({catalog:vi.fn(),history:vi.fn(),generate:vi.fn(),recover:vi.fn(),download:vi.fn(),revoke:vi.fn(),reissue:vi.fn(),intent:vi.fn(),settle:vi.fn(),settleRecovery:vi.fn(),toast:vi.fn(),owner:{isLive:()=>true}}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>m.owner}));
vi.mock('@/lib/output/client-request-intent',()=>({getOutputRequestIntent:m.intent,settleOutputRequestIntent:m.settle,settleRecoveredOutputIntent:m.settleRecovery}));
vi.mock('@/server/actions/output/generate-official-document',()=>({generateOfficialDocument:m.generate}));
vi.mock('@/server/actions/output/recover-official-document',()=>({recoverOfficialDocument:m.recover}));
vi.mock('@/server/actions/output/output-catalog',()=>({listEmployeeOutputCatalog:m.catalog}));
vi.mock('@/server/actions/output/issuance-history',()=>({listRecordIssuances:m.history,getIssuanceDownloadUrl:m.download,revokeIssuance:m.revoke,reissueOfficialDocument:m.reissue,deleteIssuance:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:m.toast,error:m.toast}}));
vi.mock('@/components/ui/button',()=>({Button:({children,variant:_,size:__,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string;size?:string})=><button {...props}>{children}</button>}));
vi.mock('@/components/ui/badge',()=>({Badge:({children}:{children:ReactNode})=><span>{children}</span>}));
vi.mock('@/features/report-center/letter-preview-dialog',()=>({LetterPreviewDialog:()=>null}));
// Lightweight child shell here tests actual caller handlers, not layout or native-dialog accessibility.
vi.mock('@/components/erp/erp-child-dialog-form',()=>({ERPChildDialogForm:({open,children,onSubmit,submitLabel,isSubmitting}:{open:boolean;children:ReactNode;onSubmit:()=>void;submitLabel:string;isSubmitting:boolean})=>open?<section><form onSubmit={e=>{e.preventDefault();onSubmit();}}>{children}<button disabled={isSubmitting}>{submitLabel}</button></form></section>:null}));
vi.mock('@/components/erp/table/record-collection',()=>({RecordCollection:({rows,renderRecord}:{rows:unknown[];renderRecord:(r:unknown)=>ReactNode})=><>{rows.map(renderRecord)}</>}));
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:({data,columns,presentation}:{data:unknown[];presentation:string;columns:Array<{id:string;header:string;cell:(r:unknown)=>ReactNode}>})=><table data-presentation={presentation}><thead><tr>{columns.map(c=><th key={c.id}>{c.header}</th>)}</tr></thead><tbody>{data.map((item,i)=><tr key={i}>{columns.map(c=><td key={c.id}>{c.cell({row:{original:item}})}</td>)}</tr>)}</tbody></table>}));
import { EmployeeLettersForms } from '@/features/hr/employees/employee-letters-forms';
const item={outputCode:'F08_QA',name:'Synthetic Letter',description:'Synthetic',category:'letter',group:'official',official:true,canGenerate:true,generatable:true,languages:['en','ar'],optionalInputs:[{key:'recipient',labelEn:'Recipient',required:true,maxLength:100}],qrPolicy:'none',wordingStatus:'published',userCanSign:false};
const row={id:7,file_name:'Synthetic_Letter.pdf',status:'issued',serial_no:'F08-SERIAL-7',issued_at:'2026-10-18T12:00:00Z',generated_at:'2026-10-18T11:00:00Z',output_code:'F08_QA',can_recover:false};
const ctx=(id=11)=>({profile:{id},roleCodes:[],permissionCodes:[],roleAssignments:[]}) as unknown as AuthContext;
const page=(id=11)=><EmployeeLettersForms authContext={ctx(id)} employeeId={1} employeeName="Synthetic employee"/>;
const success={success:true,issuanceId:7,qr:{status:'not_requested'},requestKey:'req-original',serialNo:'F08-SERIAL-7',downloadUrl:null};
beforeEach(()=>{vi.resetAllMocks();m.owner.isLive=()=>true; m.catalog.mockResolvedValue({success:true,data:[item]});m.history.mockResolvedValue({success:true,data:{items:[row],canRevoke:true,canReissue:true,canDelete:false}});m.generate.mockResolvedValue(success);m.recover.mockResolvedValue(success);m.intent.mockResolvedValue({key:'opaque-key',token:'opaque-token'});});
afterEach(cleanup);
async function panel(){fireEvent.click(await screen.findByRole('button',{name:'Generate',exact:true}));await screen.findByLabelText('Recipient');fireEvent.change(screen.getByLabelText('Recipient'),{target:{value:'Synthetic recipient'}});}
it('retains the approved compact history and aligns serial, status and issue date',async()=>{
 render(page());await screen.findByText('F08-SERIAL-7');const table=screen.getByRole('table');expect(table.dataset.presentation).toBe('embedded');
 const cells=within(table).getAllByRole('cell');expect(cells[1].textContent).toBe('F08-SERIAL-7');expect(cells[2].textContent?.trim()).toBe('Issued');expect(cells[3].textContent).toContain('18 Oct 2026');
});
it('Generate New keeps deliberate repeat authorization through the language/input panel',async()=>{
 render(page());fireEvent.click(await screen.findByRole('button',{name:'Generate New — create a fresh independent issuance with current ERP data'}));
 fireEvent.change(await screen.findByLabelText('Recipient'),{target:{value:'Synthetic'}});fireEvent.click(screen.getByRole('button',{name:'Generate Official'}));
 await waitFor(()=>expect(m.generate).toHaveBeenCalled());expect(m.generate.mock.calls[0][2]).toMatchObject({authorizeReissue:true,clientRequestToken:'opaque-token'});
});
it('a synchronous second submit cannot start a second asynchronous intent',async()=>{
 let resolve!:(v:unknown)=>void;m.intent.mockReturnValue(new Promise(r=>{resolve=r;}));render(page());await panel();
 const submit=screen.getAllByRole('button',{name:'Generate Official'}).at(-1)!;fireEvent.submit(submit.closest('form')!);fireEvent.submit(submit.closest('form')!);
 expect(m.intent).toHaveBeenCalledTimes(1);await act(async()=>resolve({key:'opaque-key',token:'opaque-token'}));await waitFor(()=>expect(m.generate).toHaveBeenCalledTimes(1));
});
it('a lost response retains the request identity instead of settling or creating a new command',async()=>{
 m.generate.mockRejectedValue(Error('Response lost'));render(page());await panel();fireEvent.submit(screen.getByLabelText('Recipient').closest('form')!);
 await screen.findAllByText('Original request retained');expect(m.settle).not.toHaveBeenCalled();expect(m.generate).toHaveBeenCalledTimes(1);
});
it('account retirement during intent hashing stops the server call',async()=>{
 let resolve!:(v:unknown)=>void;m.intent.mockReturnValue(new Promise(r=>{resolve=r;}));const view=render(page());await panel();fireEvent.submit(screen.getByLabelText('Recipient').closest('form')!);
 view.rerender(page(12));await act(async()=>resolve({key:'opaque-key',token:'opaque-token'}));expect(m.generate).not.toHaveBeenCalled();expect(m.toast).not.toHaveBeenCalled();
});
it('account retirement after submission suppresses old-account completion and downloads',async()=>{
 let resolve!:(v:unknown)=>void;m.generate.mockReturnValue(new Promise(r=>{resolve=r;}));const open=vi.spyOn(window,'open').mockImplementation(()=>null);const view=render(page());await panel();fireEvent.submit(screen.getByLabelText('Recipient').closest('form')!);
 await waitFor(()=>expect(m.generate).toHaveBeenCalled());view.rerender(page(12));await act(async()=>resolve({...success,downloadUrl:'https://synthetic.invalid/file'}));
 expect(m.toast).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();expect(m.settle).not.toHaveBeenCalled();open.mockRestore();
});
it('Recover original uses only the retained ID and clears only its matching opaque intent',async()=>{
 m.history.mockResolvedValue({success:true,data:{items:[{...row,status:'failed',can_recover:true}],canRevoke:false,canReissue:false,canDelete:false}});render(page());
 fireEvent.click(await screen.findByRole('button',{name:'Recover original'}));await screen.findByText('Original request recovered');expect(m.recover).toHaveBeenCalledWith(7);expect(m.generate).not.toHaveBeenCalled();expect(m.settleRecovery).toHaveBeenCalledWith(expect.any(String),1,'F08_QA',11,'req-original');
});
it('download network failure is handled without changing any original',async()=>{
 m.download.mockRejectedValue(Error('Network'));render(page());fireEvent.click(await screen.findByRole('button',{name:'Download / Reprint Original PDF'}));await waitFor(()=>expect(m.toast).toHaveBeenCalledWith('Download unavailable',expect.anything()));expect(m.generate).not.toHaveBeenCalled();
});
