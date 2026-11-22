// @vitest-environment jsdom
import '../f05/setup';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {WorkspaceUiMemoryProvider} from '@/hooks/use-persistent-ui-state';
import {HrSettingsLookupPage} from '@/features/hr/settings/hr-settings-lookup-page';
const m=vi.hoisted(()=>({list:vi.fn(),update:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/admin/hr/settings/grades',useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/server/actions/hr/settings',()=>({archiveHrSettingsRow:vi.fn(),listHrTrainingCategories:vi.fn()}));
vi.mock('@/server/actions/common-master-data/archive',()=>({listArchivedMasters:vi.fn(),restoreArchivedMaster:vi.fn()}));
vi.mock('@/components/erp/export/erp-export-menu',()=>({ERPExportMenu:()=>null}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
const row={id:20,code:'GRADE_20',name_en:'Existing grade',name_ar:null,description:null,is_active:false,sort_order:0,grade_level:3,workspace_revision:4,created_at:'2026-01-01',updated_at:'2026-01-01',deleted_at:null};
type Reply={success:boolean;data?:{data:typeof row[];total:number};error?:string};
function defer(){let resolve!:(v:Reply)=>void;const promise=new Promise<Reply>(r=>{resolve=r;});return {promise,resolve};}
const success=(name:string):Reply=>({success:true,data:{data:[{...row,name_en:name}],total:1}});
function tree(initialData:typeof row[],initialTotal:number,readIdentity:string,client:QueryClient){
 return <FluentProvider theme={webLightTheme}><QueryClientProvider client={client}><WorkspaceUiMemoryProvider><HrSettingsLookupPage entity="hr_grades" principalId={1} readIdentity={readIdentity} title="Grades" description="Synthetic" breadcrumbs={[]} initialData={initialData} initialTotal={initialTotal} canManage onList={m.list} onCreate={vi.fn()} onUpdate={m.update}/></WorkspaceUiMemoryProvider></QueryClientProvider></FluentProvider>;
}
function view(initialData=[row],initialTotal=initialData.length){
 const client=new QueryClient(),view=render(tree(initialData,initialTotal,'authorized-scope-a',client));
 return {...view,replace:(rows:typeof row[])=>view.rerender(tree(rows,rows.length,'authorized-scope-b',client))};
}
beforeEach(()=>{vi.resetAllMocks();m.list.mockResolvedValue(success('Refreshed grade'));m.update.mockResolvedValue({success:true,data:{id:20,entity:'hr_grades',revision:'5',changed:true,replayed:false}});});afterEach(cleanup);
it('refresh and search send a bounded counted request',async()=>{view();fireEvent.change(screen.getByRole('textbox',{name:'Search'}),{target:{value:'GRADE_20'}});await waitFor(()=>expect(m.list).toHaveBeenCalledWith(expect.objectContaining({search:'GRADE_20',page:1,page_size:25})));});
it('late earlier search cannot replace the post-save authorized page',async()=>{const old=defer(),fresh=defer();m.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);view();fireEvent.change(screen.getByRole('textbox',{name:'Search'}),{target:{value:'grade'}});await waitFor(()=>expect(m.list).toHaveBeenCalledOnce());expect(m.list).toHaveBeenLastCalledWith(expect.objectContaining({search:'grade',page:1,page_size:25}));fireEvent.click(screen.getByRole('button',{name:'Edit record'}));fireEvent.change(screen.getByLabelText('Name (English)'),{target:{value:'Saved grade'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(m.update).toHaveBeenCalledOnce());expect(document.body.textContent).not.toContain('Save response incomplete');expect(document.body.textContent).not.toContain('Save unconfirmed');await waitFor(()=>expect(m.list,document.body.textContent??'').toHaveBeenCalledTimes(2));await act(async()=>{fresh.resolve(success('Fresh result'));old.resolve(success('Old result'));});expect((await screen.findAllByText('Fresh result')).length).toBeGreaterThan(0);expect(screen.queryByText('Old result')).toBeNull();});
it('failed read retains the open draft and safely retries the same bounded search',async()=>{const pending=defer();m.list.mockReturnValueOnce(pending.promise);view();fireEvent.change(screen.getByRole('textbox',{name:'Search'}),{target:{value:'grade'}});fireEvent.click(screen.getByRole('button',{name:'Edit record'}));fireEvent.change(screen.getByLabelText('Name (English)'),{target:{value:'Retained draft'}});await act(async()=>pending.resolve({success:false,error:'PRIVATE'}));expect((screen.getByLabelText('Name (English)') as HTMLInputElement).value).toBe('Retained draft');expect(document.body.textContent).not.toContain('PRIVATE');fireEvent.click(screen.getByRole('button',{name:'Cancel'}));fireEvent.click(await screen.findByRole('button',{name:'Discard changes'}));fireEvent.click(await screen.findByRole('button',{name:'Retry loading'}));await waitFor(()=>expect(m.list).toHaveBeenLastCalledWith(expect.objectContaining({search:'grade',page:1,page_size:25})));});
it('late list completion cannot regenerate an uncertain original save or opening revision',async()=>{const pending=defer();m.list.mockReturnValueOnce(pending.promise);m.update.mockRejectedValueOnce(Error('lost response'));view();fireEvent.change(screen.getByRole('textbox',{name:'Search'}),{target:{value:'grade'}});fireEvent.click(screen.getByRole('button',{name:'Edit record'}));fireEvent.change(screen.getByLabelText('Name (English)'),{target:{value:'Retained change'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByText(/Save unconfirmed/);const first=m.update.mock.calls[0];expect(first[1]).toMatchObject({grade_level:3,is_active:false,sort_order:0});expect(first[2]).toMatchObject({revision:'4'});await act(async()=>pending.resolve(success('Newer list row')));fireEvent.click(screen.getByRole('button',{name:'Retry same save'}));await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(2));expect(m.update.mock.calls[1]).toEqual(first);});

it('a failed search from a previously empty list does not show an empty result',async()=>{
 m.list.mockResolvedValueOnce({success:false,error:'PRIVATE'});
 view([]);
 fireEvent.change(screen.getByRole('textbox',{name:'Search'}),{target:{value:'Retained search'}});
 await screen.findByRole('button',{name:'Retry loading'});
 expect(screen.queryByText('No grades yet')).toBeNull();
 expect(screen.queryByText('0 items')).toBeNull();
 expect(screen.getByRole('textbox',{name:'Search'})).toHaveProperty('value','Retained search');

 m.list.mockResolvedValueOnce({success:true,data:{data:[],total:0}});
 fireEvent.click(screen.getByRole('button',{name:'Retry loading'}));
 await screen.findByText('0 items');
 expect(m.list).toHaveBeenLastCalledWith(expect.objectContaining({search:'Retained search',page:1,page_size:25}));
});
it('coalesces four quick search inputs into a single exact first-page request',async()=>{
 view();
 const field=screen.getByRole('textbox',{name:'Search'});
 for(const value of ['g','gr','gra','grade'])fireEvent.change(field,{target:{value}});
 await waitFor(()=>expect(m.list).toHaveBeenLastCalledWith(expect.objectContaining({search:'grade',page:1,page_size:25})));
 expect(m.list).toHaveBeenCalledOnce();
});

it('opens a later matching page with one request and an exact total',async()=>{
 const full=Array.from({length:25},(_,index)=>({...row,id:index+1,code:'GRADE_'+(index+1)}));
 m.list.mockResolvedValueOnce({success:true,data:{data:[{...row,id:26,name_en:'Late permitted grade'}],total:26}});
 view(full,26);
 expect(m.list).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Next'}));
 await screen.findAllByText('Late permitted grade');
 expect(m.list).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({page:2,page_size:25}));
 expect(screen.getByText('26 items')).toBeTruthy();
});

it('recovers a removed last page and never reports a false empty catalogue',async()=>{
 const full=Array.from({length:25},(_,index)=>({...row,id:index+1,code:'GRADE_'+(index+1)}));
 m.list.mockResolvedValueOnce({success:true,data:{data:[],total:25}}).mockResolvedValueOnce({success:true,data:{data:full,total:25}});
 view(full,26);
 fireEvent.click(screen.getByRole('button',{name:'Next'}));
 await waitFor(()=>expect(m.list.mock.calls.map(([criteria])=>criteria.page)).toEqual([2,1]));
 await screen.findByText('25 items');
 expect(screen.queryByText('No grades yet')).toBeNull();
});

it('retires the former scope before a late list reply can restore its rows',async()=>{
 const pending=defer();
 m.list.mockReturnValueOnce(pending.promise);
 const page=view();
 fireEvent.change(screen.getByRole('textbox',{name:'Search'}),{target:{value:'OLD_SCOPE'}});
 await waitFor(()=>expect(m.list).toHaveBeenCalledOnce());
 page.replace([{...row,name_en:'New scoped grade'}]);
 await act(async()=>pending.resolve(success('Private former grade')));
 expect(screen.queryByText('Private former grade')).toBeNull();
 expect(screen.queryByText('Existing grade')).toBeNull();
 expect(screen.getAllByText('New scoped grade').length).toBeGreaterThan(0);
});

it('confirmed no-op keeps the exact page and sends no follow-up read',async()=>{
 m.update.mockResolvedValueOnce({success:true,data:{id:20,entity:'hr_grades',revision:'4',changed:false,replayed:false}});
 view();
 fireEvent.click(screen.getByRole('button',{name:'Edit record'}));
 fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(m.update).toHaveBeenCalledOnce());
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(m.list).not.toHaveBeenCalled();
});