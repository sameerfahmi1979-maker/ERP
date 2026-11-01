// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
import type {AuthContext} from '@/lib/rbac/check';
import type {EmployeeOutputCatalogItem} from '@/server/actions/output/output-catalog';
const m=vi.hoisted(()=>({preview:vi.fn(),issue:vi.fn(),create:vi.fn(),revoke:vi.fn(),live:true}));
vi.mock('@/server/actions/output/preview-official-document',()=>({previewOfficialDocument:m.preview}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>({isLive:()=>m.live})}));
vi.mock('@/components/erp/erp-child-dialog-form',()=>({ERPChildDialogForm:({children,onSubmit,submitDisabled,footerActions,title}:{children:ReactNode;onSubmit:()=>void;submitDisabled:boolean;footerActions:ReactNode;title:string})=><div role="dialog" aria-label={title}>{children}<button type="button" disabled={submitDisabled} onClick={onSubmit}>Refresh preview</button>{footerActions}</div>}));
vi.mock('@/components/erp/combobox',()=>({ERPCombobox:({ariaLabel,value,options,onValueChange}:{ariaLabel:string;value:string|number;options:{value:string|number;label:string}[];onValueChange:(value:string|number)=>void})=><select aria-label={ariaLabel} value={value} onChange={e=>onValueChange(e.target.value==='default'?'default':Number(e.target.value))}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}));
vi.mock('@/hooks/use-report-template-selection',()=>({useReportTemplateSelection:()=>({rows:[{id:3,template_name:'Synthetic alternate letterhead',selectable:true}],getSelectedNow:()=>({id:3}),ready:true,busy:false,denied:false,error:null,totalCount:1,pageSize:25,page:1})}));
import {OfficialDraftPreviewDialog} from '@/features/report-center/official-draft-preview-dialog';
import {listOfficialDocumentDefinitions} from '@/lib/official-documents/registry';
const item={outputCode:'HR_WARNING_LETTER',name:'Warning',previewLanguages:['en','ar','bilingual'],optionalInputs:[],canPreview:true,canBrandingOverride:true,ownerCompanyId:1,wordingStatus:'draft',generatable:false,canGenerate:true} as EmployeeOutputCatalogItem;
const ctx=(id:number)=>({profile:{id},permissionCodes:[],roleAssignments:[],roleCodes:[]}) as unknown as AuthContext;
const page=(id=1,open=true,overrides:Partial<EmployeeOutputCatalogItem>={})=><OfficialDraftPreviewDialog authContext={ctx(id)} employeeId={1} item={{...item,...overrides}} open={open} onOpenChange={vi.fn()} onIssue={m.issue}/>;
const success={success:true,pdfBase64:btoa('%PDF-unit-only'),asOf:'2026-10-30T08:00:00Z',notice:'DRAFT - NOT ISSUED'};
beforeEach(()=>{vi.resetAllMocks();m.live=true;m.preview.mockResolvedValue(success);m.create.mockReturnValue('blob:synthetic-draft');Object.defineProperty(URL,'createObjectURL',{configurable:true,value:m.create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:m.revoke});});
afterEach(cleanup);
it('approved wording with a source hold defaults to sample review, explains the hold and cannot issue',async()=>{
 render(page(1,true,{wordingStatus:'published',wordingApproved:true,sourceWorkflowPending:true}));await screen.findByTitle('Canonical draft PDF');
 expect((screen.getByRole('checkbox',{name:'Use sample details for wording review'}) as HTMLInputElement).checked).toBe(true);
 expect(screen.getByText('Wording is approved. This document remains held until its verified source workflow is integrated.')).toBeTruthy();
 expect((screen.getByRole('button',{name:'Generate Official'}) as HTMLButtonElement).disabled).toBe(true);expect(m.issue).not.toHaveBeenCalled();
});
it.each(listOfficialDocumentDefinitions().filter(def=>def.documentCode!=='HR_EMPLOYMENT_CONFIRMATION').map(def=>def.documentCode))('%s uses the same persistent workbench and sample-only approval boundary',async outputCode=>{
 render(page(1,true,{outputCode}));await screen.findByTitle('Canonical draft PDF');
 expect(screen.getByRole('region',{name:'Letter settings'})).toBeTruthy();expect(screen.getByRole('region',{name:'Document preview'})).toBeTruthy();
 expect(m.preview).toHaveBeenCalledWith(expect.objectContaining({outputCode,wordingReview:true}));
 expect((screen.getByRole('button',{name:'Generate Official'}) as HTMLButtonElement).disabled).toBe(true);expect(m.issue).not.toHaveBeenCalled();
});
it('updates the inline letterhead/language without another dialog, and retires the old download',async()=>{
 render(page());await screen.findByTitle('Canonical draft PDF');const dialog=screen.getByRole('dialog');
 fireEvent.change(screen.getByLabelText('Language'),{target:{value:'bilingual'}});fireEvent.change(screen.getByLabelText('Company letterhead'),{target:{value:'3'}});
 expect(screen.queryByRole('link',{name:'Download draft'})).toBeNull();await waitFor(()=>expect(m.preview).toHaveBeenCalledTimes(2));
 expect(m.preview.mock.calls[1][0]).toMatchObject({language:'bilingual',templateId:3,wordingReview:true});expect(screen.getAllByRole('dialog')).toHaveLength(1);expect(screen.getByRole('dialog')).toBe(dialog);
});
it('sample details cannot be officially issued even if a stale catalogue says approved',async()=>{
 render(page(1,true,{generatable:true}));await screen.findByTitle('Canonical draft PDF');fireEvent.click(screen.getByRole('button',{name:'Generate Official'}));expect(m.issue).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('checkbox',{name:'Use sample details for wording review'}));expect(screen.queryByRole('link',{name:'Download draft'})).toBeNull();
 await waitFor(()=>expect(m.preview).toHaveBeenCalledTimes(2));expect(m.preview.mock.calls[1][0]).not.toHaveProperty('wordingReview');
});
it('renders declared date/choice fields, validates required fields and preserves request-scoped values',async()=>{
 render(page(1,true,{optionalInputs:[{key:'purpose',labelEn:'Purpose',required:true,maxLength:100},{key:'valid_until',labelEn:'Expiry date',type:'date',required:false,maxLength:10}]}));
 await screen.findByTitle('Canonical draft PDF');expect((screen.getByLabelText('Expiry date') as HTMLInputElement).type).toBe('date');
 fireEvent.click(screen.getByRole('checkbox',{name:'Use sample details for wording review'}));expect(screen.getByRole('alert').textContent).toContain('Purpose');
 fireEvent.change(screen.getByLabelText('Purpose *'),{target:{value:'Request-specific purpose'}});await waitFor(()=>expect(m.preview).toHaveBeenCalledTimes(2));
 expect(m.preview.mock.calls[1][0]).toMatchObject({inputs:{purpose:'Request-specific purpose'}});
});
it.each(['principal','closed','scope'])('discards a late draft when %s retires it',async mode=>{
 let resolve!:(v:unknown)=>void;m.preview.mockReturnValue(new Promise(r=>{resolve=r;}));const view=render(page());await waitFor(()=>expect(m.preview).toHaveBeenCalledTimes(1));
 if(mode==='principal')view.rerender(page(2));if(mode==='closed')view.rerender(page(1,false));if(mode==='scope'){m.live=false;view.rerender(page());}
 await act(async()=>resolve(success));expect(m.create).not.toHaveBeenCalled();expect(screen.queryByTitle('Canonical draft PDF')).toBeNull();
});
it('collapses double refresh and safely reports an unconfirmed preview failure',async()=>{
 let reject!:(v:unknown)=>void;m.preview.mockReturnValue(new Promise((_r,j)=>{reject=j;}));render(page());const button=screen.getByRole('button',{name:'Refresh preview'});fireEvent.click(button);fireEvent.click(button);expect(m.preview).toHaveBeenCalledTimes(1);
 await act(async()=>reject(Error('PRIVATE')));expect(screen.getByRole('alert').textContent).toContain('no official document was issued');expect(screen.queryByText('PRIVATE')).toBeNull();
});

vi.mock('@/server/actions/output/hr-letter-reviews',()=>({hrLetterReview:async()=>({success:true,rows:[],options:[]})}));
vi.mock('@/server/actions/output/hr-letter-source-choices',()=>({listHrLetterSources:async()=>({success:true,rows:[],hasMore:false})}));
