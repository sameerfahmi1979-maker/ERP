// @vitest-environment jsdom
import '../f05/setup';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
import type {EmployeeOutputCatalogItem} from '@/server/actions/output/output-catalog';
const m=vi.hoisted(()=>({preview:vi.fn()}));
vi.mock('@/hooks/use-workspace-navigation-lock',()=>({useWorkspaceNavigationLock:()=>{}}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>({isLive:()=>true})}));
vi.mock('@/server/actions/output/preview-official-document',()=>({previewOfficialDocument:m.preview}));
vi.mock('@/hooks/use-report-template-selection',()=>({useReportTemplateSelection:(_ctx:unknown,options:{selectedId:number|null})=>{
 const row={id:3,template_name:'QA Company Letterhead',company_name:'Synthetic Company',selectable:true};
 return {rows:[row],selected:options.selectedId===3?row:null,getSelectedNow:()=>options.selectedId===3?row:null,ready:true,busy:false,denied:false,error:null,selectionUnavailable:false,totalCount:1,pageSize:25,page:1,setSearch:vi.fn(),retry:vi.fn(),move:vi.fn()};
}}));
import {OfficialDraftPreviewDialog} from '@/features/report-center/official-draft-preview-dialog';
afterEach(cleanup);
it('uses the actual ERP dialog and inline combobox without opening another template dialog',async()=>{
 m.preview.mockResolvedValue({success:false,error:'Synthetic renderer result'});
 const item={outputCode:'HR_EMPLOYMENT_CONFIRMATION',name:'Employment Confirmation',previewLanguages:['en','ar','bilingual'],optionalInputs:[],canPreview:true,canBrandingOverride:true,ownerCompanyId:1,generatable:false} as EmployeeOutputCatalogItem;
 render(<OfficialDraftPreviewDialog authContext={syntheticAuthContext([])} employeeId={1} item={item} open onOpenChange={vi.fn()}/>);
 const parent=await screen.findByRole('dialog',{name:'Employment Confirmation Certificate'});
 expect(parent.className).toContain('sm:max-w-[85vw]');
 fireEvent.click(within(parent).getByRole('combobox',{name:'Company letterhead'}));
 fireEvent.click(await screen.findByRole('option',{name:/QA Company Letterhead/}));
 expect(screen.getAllByRole('dialog')).toHaveLength(1);expect(screen.getByRole('dialog')).toBe(parent);
 expect(within(parent).getByRole('combobox',{name:'Company letterhead'}).textContent).toContain('QA Company Letterhead');
 await waitFor(()=>expect(m.preview).toHaveBeenCalledWith(expect.objectContaining({templateId:3})),{timeout:2500});
 expect(within(parent).getByRole('button',{name:'Generate Official'}).hasAttribute('disabled')).toBe(true);
});

vi.mock('@/server/actions/output/hr-letter-reviews',()=>({hrLetterReview:async()=>({success:true,rows:[],options:[]})}));
vi.mock('@/server/actions/output/hr-letter-source-choices',()=>({listHrLetterSources:async()=>({success:true,rows:[],hasMore:false})}));
