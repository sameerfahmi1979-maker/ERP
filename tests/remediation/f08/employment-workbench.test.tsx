// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
import type {AuthContext} from '@/lib/rbac/check';
import type {EmployeeOutputCatalogItem} from '@/server/actions/output/output-catalog';
const m=vi.hoisted(()=>({preview:vi.fn(),issue:vi.fn(),create:vi.fn(),revoke:vi.fn(),live:true,selectionReady:true}));
vi.mock('@/server/actions/output/preview-official-document',()=>({previewOfficialDocument:m.preview}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>({isLive:()=>m.live})}));
vi.mock('@/components/erp/erp-child-dialog-form',()=>({ERPChildDialogForm:({children,onSubmit,submitDisabled,footerActions,title}:{children:ReactNode;onSubmit:()=>void;submitDisabled:boolean;footerActions:ReactNode;title:string})=><div role="dialog" aria-label={title}>{children}<button type="button" disabled={submitDisabled} onClick={onSubmit}>Refresh preview</button>{footerActions}</div>}));
vi.mock('@/components/erp/combobox',()=>({ERPCombobox:({ariaLabel,value,options,onValueChange}:{ariaLabel:string;value:string|number;options:{value:string|number;label:string;disabled?:boolean}[];onValueChange:(v:string|number)=>void})=><select aria-label={ariaLabel} value={value} onChange={e=>onValueChange(e.target.value==='default'?'default':Number(e.target.value))}>{options.map(o=><option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}</select>}));
vi.mock('@/hooks/use-report-template-selection',()=>({useReportTemplateSelection:(_auth:unknown,options:{selectedId:number|null})=>{
 const row={id:3,template_name:'QA company letterhead',selectable:true};
 return {rows:[row],selected:options.selectedId===3&&m.selectionReady?row:null,getSelectedNow:()=>options.selectedId===3&&m.selectionReady?row:null,
  busy:!m.selectionReady,ready:m.selectionReady,denied:false,error:null,selectionUnavailable:false,totalCount:1,pageSize:25,page:1,setSearch:vi.fn(),retry:vi.fn(),move:vi.fn()};
}}));
import {OfficialDraftPreviewDialog} from '@/features/report-center/official-draft-preview-dialog';
const item={outputCode:'HR_EMPLOYMENT_CONFIRMATION',name:'Employment Confirmation',previewLanguages:['en','ar','bilingual'],optionalInputs:[],canPreview:true,canBrandingOverride:true,ownerCompanyId:1,generatable:false,canGenerate:true,approvalRequired:true} as EmployeeOutputCatalogItem;
const ctx=(id:number)=>({profile:{id},permissionCodes:[],roleCodes:[],roleAssignments:[]}) as unknown as AuthContext;
const page=(id=11,open=true,overrides:Partial<EmployeeOutputCatalogItem>={})=><OfficialDraftPreviewDialog authContext={ctx(id)} employeeId={1} item={{...item,...overrides}} open={open} onOpenChange={vi.fn()} onIssue={m.issue}/>;
const success={success:true,pdfBase64:btoa('%PDF-synthetic-only'),asOf:'2026-10-29T00:00:00Z',notice:'DRAFT — NOT ISSUED'};
beforeEach(()=>{vi.resetAllMocks();m.live=true;m.selectionReady=true;m.preview.mockResolvedValue(success);m.issue.mockResolvedValue(undefined);m.create.mockImplementation(()=>`blob:synthetic-${m.create.mock.calls.length}`);Object.defineProperty(URL,'createObjectURL',{configurable:true,value:m.create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:m.revoke});});
afterEach(cleanup);
it('automatically previews once inside a persistent settings/preview dialog, without issuing or approving wording',async()=>{
 render(page());await screen.findByTitle('Canonical draft PDF');
 expect(m.preview).toHaveBeenCalledTimes(1);expect(screen.getByRole('region',{name:'Letter settings'})).toBeTruthy();
 expect(screen.getByRole('region',{name:'Document preview'})).toBeTruthy();
 expect((screen.getByRole('button',{name:'Generate Official'}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.queryByRole('button',{name:'Send for approval'})).toBeNull();expect(m.issue).not.toHaveBeenCalled();
});
it('keeps the dialog and old frame mounted while the inline letterhead updates; stale draft cannot be downloaded',async()=>{
 render(page());const frame=await screen.findByTitle('Canonical draft PDF'),dialog=screen.getByRole('dialog');
 expect(screen.getByRole('link',{name:'Download draft'})).toBeTruthy();
 fireEvent.change(screen.getByRole('combobox',{name:'Company letterhead'}),{target:{value:'3'}});
 expect(screen.getByRole('dialog')).toBe(dialog);expect(screen.getByTitle('Canonical draft PDF')).toBe(frame);
 expect(screen.queryByRole('link',{name:'Download draft'})).toBeNull();
 await waitFor(()=>expect(m.preview).toHaveBeenCalledTimes(2));
 expect(m.preview.mock.calls[1][0]).toMatchObject({templateId:3});
 await waitFor(()=>expect(screen.getByRole('link',{name:'Download draft'})).toBeTruthy());
 expect(m.revoke).toHaveBeenCalledWith('blob:synthetic-1');
});
it('requires recipient text in each selected language, retains edits and does not alter employee identity',async()=>{
 render(page());await screen.findByTitle('Canonical draft PDF');
 fireEvent.change(screen.getByLabelText('Addressed to'),{target:{value:'specific'}});
 expect(screen.getByRole('alert').textContent).toContain('English');expect(screen.queryByRole('link',{name:'Download draft'})).toBeNull();
 fireEvent.change(screen.getByLabelText('Organisation (English)'),{target:{value:'QA Bank'}});
 fireEvent.change(screen.getByLabelText('Language'),{target:{value:'bilingual'}});
 expect(screen.getByRole('alert').textContent).toContain('Arabic');
 fireEvent.change(screen.getByLabelText('Department / recipient (Arabic)'),{target:{value:'قسم الاختبار'}});
 fireEvent.change(screen.getByLabelText('Employee title'),{target:{value:'Mr.'}});
 await waitFor(()=>expect(m.preview).toHaveBeenCalledTimes(2));
 expect(m.preview.mock.calls[1][0]).toMatchObject({employeeId:1,language:'bilingual',inputs:{recipient_mode:'specific',recipient_organization_en:'QA Bank',recipient_department_ar:'قسم الاختبار',employee_title:'Mr.'}});
 expect((screen.getByLabelText('Organisation (English)') as HTMLInputElement).value).toBe('QA Bank');
});
it('serializes rendering, ignores obsolete responses and renders only the newest queued settings',async()=>{
 const done:((v:unknown)=>void)[]=[];m.preview.mockImplementation(()=>new Promise(resolve=>done.push(resolve)));
 render(page());await waitFor(()=>expect(done).toHaveLength(1));
 fireEvent.change(screen.getByLabelText('Language'),{target:{value:'ar'}});
 fireEvent.change(screen.getByLabelText('Language'),{target:{value:'bilingual'}});
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,550));});expect(m.preview).toHaveBeenCalledTimes(1);
 await act(async()=>done[0](success));await waitFor(()=>expect(done).toHaveLength(2));expect(m.create).not.toHaveBeenCalled();
 expect(m.preview.mock.calls[1][0].language).toBe('bilingual');
 await act(async()=>done[1](success));await screen.findByTitle('Canonical draft PDF');expect(m.create).toHaveBeenCalledTimes(1);
});
it.each(['closed','principal','scope'])('drops a late preview after %s retirement',async mode=>{
 let done!:(v:unknown)=>void;m.preview.mockReturnValue(new Promise(resolve=>{done=resolve;}));
 const view=render(page());await waitFor(()=>expect(m.preview).toHaveBeenCalledTimes(1));
 if(mode==='closed')view.rerender(page(11,false));if(mode==='principal')view.rerender(page(12));if(mode==='scope'){m.live=false;view.rerender(page());}
 await act(async()=>done(success));expect(m.create).not.toHaveBeenCalled();
});
it('keeps a failed current draft unavailable and allows an explicit retry without raw errors',async()=>{
 m.preview.mockRejectedValueOnce(Error('PRIVATE'));render(page());await screen.findByRole('alert');
 expect(screen.queryByRole('link',{name:'Download draft'})).toBeNull();expect(screen.queryByText('PRIVATE')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Refresh preview'}));await screen.findByTitle('Canonical draft PDF');expect(m.preview).toHaveBeenCalledTimes(2);
});
it('cannot preview an unverified selected letterhead or reuse its old draft',async()=>{
 const view=render(page());await screen.findByTitle('Canonical draft PDF');m.selectionReady=false;
 fireEvent.change(screen.getByLabelText('Company letterhead'),{target:{value:'3'}});
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,550));});expect(m.preview).toHaveBeenCalledTimes(1);
 expect(screen.queryByRole('link',{name:'Download draft'})).toBeNull();
 m.selectionReady=true;view.rerender(page());await waitFor(()=>expect(m.preview).toHaveBeenCalledTimes(2));
});
it('issues only on an explicit click with the exact reviewed values and blocks rapid duplicates',async()=>{
 let done!:()=>void;m.issue.mockReturnValue(new Promise<void>(resolve=>{done=resolve;}));render(page(11,true,{generatable:true}));await screen.findByTitle('Canonical draft PDF');
 const button=screen.getByRole('button',{name:'Generate Official'});fireEvent.click(button);fireEvent.click(button);
 expect(m.issue).toHaveBeenCalledExactlyOnceWith('en',{recipient_mode:'general',employee_title:''},undefined);
 await act(async()=>done());
});
it('releases the generated draft URL when the preparation dialog closes',async()=>{
 const view=render(page());await screen.findByTitle('Canonical draft PDF');view.rerender(page(11,false));expect(m.revoke).toHaveBeenCalledWith('blob:synthetic-1');
});

vi.mock('@/server/actions/output/hr-letter-reviews',()=>({hrLetterReview:async()=>({success:true,rows:[],options:[]})}));
vi.mock('@/server/actions/output/hr-letter-source-choices',()=>({listHrLetterSources:async()=>({success:true,rows:[],hasMore:false})}));
