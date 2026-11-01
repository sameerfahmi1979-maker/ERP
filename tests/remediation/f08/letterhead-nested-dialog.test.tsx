// @vitest-environment jsdom
import '../f05/setup';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {EmployeeOutputCatalogItem} from '@/server/actions/output/output-catalog';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
const m=vi.hoisted(()=>({preview:vi.fn()}));
vi.mock('@/hooks/use-workspace-navigation-lock',()=>({useWorkspaceNavigationLock:()=>{}}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>({isLive:()=>true})}));
vi.mock('@/server/actions/output/preview-official-document',()=>({previewOfficialDocument:m.preview}));
vi.mock('@/hooks/use-report-template-selection',()=>({useReportTemplateSelection:(_ctx:unknown,criteria:{selectedId:number|null})=>{
 const template={id:3,template_name:'Synthetic company letterhead',template_code:'SYN-LH',template_type:'letterhead',branding_profile_type:'company',branding_profile_name:'Synthetic',company_name:'Synthetic company',logo_url:null,selectable:true};
 return {rows:[template],selected:criteria.selectedId===3?template:null,getSelectedNow:()=>criteria.selectedId===3?template:null,ready:true,busy:false,denied:false,invalid:false,error:null,search:'',setSearch:vi.fn(),retry:vi.fn(),selectionUnavailable:false,totalCount:1,page:1,pageSize:25,move:vi.fn()};
}}));
import {OfficialDraftPreviewDialog} from '@/features/report-center/official-draft-preview-dialog';
import {ReportTemplateSelectDialog} from '@/components/report-center/report-template-select-dialog';
const item={outputCode:'HR_OFFICIAL_WARNING',name:'Official Warning Letter',previewLanguages:['en'],optionalInputs:[],canPreview:true,canBrandingOverride:true,ownerCompanyId:1} as EmployeeOutputCatalogItem;
const page=()=> <OfficialDraftPreviewDialog authContext={syntheticAuthContext([])} employeeId={1} item={item} open onOpenChange={vi.fn()}/>;
beforeEach(()=>{vi.clearAllMocks();m.preview.mockResolvedValue({success:false,error:'Synthetic draft result'});});
afterEach(cleanup);
it('keeps the actual warning workbench open while the inline letterhead popup selects an option',async()=>{
 render(page());const parent=await screen.findByRole('dialog',{name:'Official Warning Letter'});
 expect(parent.className).toContain('sm:max-w-[85vw]');fireEvent.click(within(parent).getByRole('combobox',{name:'Company letterhead'}));
 fireEvent.click(await screen.findByRole('option',{name:/Synthetic company letterhead/}));
 expect(screen.getAllByRole('dialog')).toHaveLength(1);expect(screen.getByRole('dialog')).toBe(parent);
 expect(within(parent).getByRole('combobox',{name:'Company letterhead'}).textContent).toContain('Synthetic company letterhead');
 await waitFor(()=>expect(m.preview).toHaveBeenCalledWith({outputCode:item.outputCode,employeeId:1,language:'en',inputs:{},templateId:3}));
});
it('Escape closes only the letterhead options and retains company default in the workbench',async()=>{
 render(page());const parent=await screen.findByRole('dialog',{name:'Official Warning Letter'}),control=within(parent).getByRole('combobox',{name:'Company letterhead'});
 fireEvent.click(control);await screen.findByRole('option',{name:/Synthetic company letterhead/});
 await act(async()=>{fireEvent.keyDown(document.activeElement??control,{key:'Escape'});});
 await waitFor(()=>expect(screen.queryByRole('option',{name:/Synthetic company letterhead/})).toBeNull());
 expect(screen.getByRole('dialog')).toBe(parent);expect(control.textContent).toContain("Employee's company default");
});
it('a standalone template chooser keeps its normal layer',async()=>{render(<ReportTemplateSelectDialog authContext={syntheticAuthContext([])} open onOpenChange={vi.fn()} onSelect={vi.fn()}/>);const picker=await screen.findByRole('dialog',{name:'Select Report Template'});expect(picker.className).toContain('z-50');expect(picker.className).not.toContain('z-[130]');});

vi.mock('@/server/actions/output/hr-letter-reviews',()=>({hrLetterReview:async()=>({success:true,rows:[],options:[]})}));
vi.mock('@/server/actions/output/hr-letter-source-choices',()=>({listHrLetterSources:async()=>({success:true,rows:[],hasMore:false})}));
