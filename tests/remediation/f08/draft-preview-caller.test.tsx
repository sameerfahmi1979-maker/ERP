// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import type {EmployeeOutputCatalogItem} from '@/server/actions/output/output-catalog';
const m=vi.hoisted(()=>({preview:vi.fn(),create:vi.fn(),revoke:vi.fn(),live:true}));
vi.mock('@/server/actions/output/preview-official-document',()=>({previewOfficialDocument:m.preview}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>({isLive:()=>m.live})}));
vi.mock('@/components/erp/erp-child-dialog-form',()=>({ERPChildDialogForm:({children,onSubmit}:{children:React.ReactNode;onSubmit:()=>void})=><form onSubmit={e=>{e.preventDefault();onSubmit();}}>{children}<button>Preview draft</button></form>}));
vi.mock('@/components/ui/button',()=>({Button:({children,variant:_,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string})=><button {...props}>{children}</button>}));
vi.mock('@/components/ui/input',()=>({Input:(props:React.InputHTMLAttributes<HTMLInputElement>)=><input {...props}/>}));
vi.mock('@/components/report-center/report-template-select-dialog',()=>({ReportTemplateSelectDialog:({open,onSelect}:{open:boolean;onSelect:(id:number,t:unknown)=>void})=>open?<button type="button" onClick={()=>onSelect(3,{template_name:'Synthetic alternate letterhead'})}>Select synthetic letterhead</button>:null}));
import {OfficialDraftPreviewDialog} from '@/features/report-center/official-draft-preview-dialog';
const item={outputCode:'HR_EMPLOYMENT_CONFIRMATION',name:'Confirmation',previewLanguages:['en','ar','bilingual'],optionalInputs:[],canPreview:true,canBrandingOverride:true,ownerCompanyId:1} as EmployeeOutputCatalogItem;
const ctx=(id:number)=>({profile:{id},permissionCodes:[],roleAssignments:[],roleCodes:[]}) as unknown as AuthContext;
const page=(id=1,open=true)=><OfficialDraftPreviewDialog authContext={ctx(id)} employeeId={1} item={item} open={open} onOpenChange={vi.fn()}/>;
const success={success:true,pdfBase64:btoa('%PDF-unit-only'),asOf:'2026-10-18T08:00:00Z',notice:'DRAFT - NOT ISSUED'};
beforeEach(()=>{vi.resetAllMocks();m.live=true;m.preview.mockResolvedValue(success);m.create.mockReturnValue('blob:synthetic-draft');Object.defineProperty(URL,'createObjectURL',{configurable:true,value:m.create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:m.revoke});});
afterEach(cleanup);
it('passes exact language, subject and chosen letterhead; presents only a draft PDF',async()=>{
 render(page());fireEvent.change(screen.getByLabelText('Language'),{target:{value:'bilingual'}});fireEvent.click(screen.getByRole('button',{name:'Choose letterhead'}));fireEvent.click(screen.getByRole('button',{name:'Select synthetic letterhead'}));
 fireEvent.click(screen.getByRole('button',{name:'Preview draft'}));await screen.findByTitle('Canonical draft PDF');expect(m.preview).toHaveBeenCalledExactlyOnceWith({outputCode:item.outputCode,employeeId:1,language:'bilingual',inputs:{},templateId:3});expect(screen.queryByRole('button',{name:/Generate official/i})).toBeNull();
});
it('clears and releases an old PDF when its language changes or the dialog closes',async()=>{
 const view=render(page());fireEvent.click(screen.getByRole('button',{name:'Preview draft'}));await screen.findByTitle('Canonical draft PDF');fireEvent.change(screen.getByLabelText('Language'),{target:{value:'ar'}});expect(screen.queryByTitle('Canonical draft PDF')).toBeNull();await waitFor(()=>expect(m.revoke).toHaveBeenCalledWith('blob:synthetic-draft'));view.rerender(page(1,false));expect(screen.queryByRole('form')).toBeNull();
});
it.each(['principal','closed','scope'])('discards a late draft when %s retires it',async mode=>{
 let resolve!:(v:unknown)=>void;m.preview.mockReturnValue(new Promise(r=>{resolve=r;}));const view=render(page());fireEvent.click(screen.getByRole('button',{name:'Preview draft'}));
 if(mode==='principal')view.rerender(page(2));if(mode==='closed')view.rerender(page(1,false));if(mode==='scope'){m.live=false;view.rerender(page());}
 await act(async()=>resolve(success));expect(m.create).not.toHaveBeenCalled();expect(screen.queryByTitle('Canonical draft PDF')).toBeNull();
});
it('prevents synchronous double submit and presents unconfirmed network failure safely',async()=>{
 let reject!:(v:unknown)=>void;m.preview.mockReturnValue(new Promise((_r,j)=>{reject=j;}));render(page());const form=screen.getByRole('button',{name:'Preview draft'}).closest('form')!;fireEvent.submit(form);fireEvent.submit(form);expect(m.preview).toHaveBeenCalledTimes(1);await act(async()=>reject(Error('PRIVATE')));expect(screen.getByRole('alert').textContent).toContain('no official document was issued');expect(screen.queryByText('PRIVATE')).toBeNull();
});
