// @vitest-environment jsdom
// Real shared form and F04 validation; list and mutation responses are doubles.
import '../f05/setup';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {WorkspaceUiMemoryProvider} from '@/hooks/use-persistent-ui-state';
import {HrSettingsLookupPage,type HrSettingsLookupProps} from '@/features/hr/settings/hr-settings-lookup-page';
import {hrLookupOptionFields,initialHrLookupOptions,hrLookupOptionPayload} from '@/lib/hr/lookup-option-fields';
import type {HrLookupTable} from '@/lib/hr/settings-save-contract';
const m=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),list:vi.fn(),categories:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/admin/hr/settings/leave-types',useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/server/actions/hr/settings',()=>({archiveHrSettingsRow:vi.fn(),listHrTrainingCategories:m.categories}));
vi.mock('@/server/actions/common-master-data/archive',()=>({listArchivedMasters:vi.fn(),restoreArchivedMaster:vi.fn()}));
vi.mock('@/components/erp/export/erp-export-menu',()=>({ERPExportMenu:()=>null}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
const base={id:20,code:'F06_OPTIONS',name_en:'Synthetic options',name_ar:null,description:null,is_active:false,sort_order:0,created_at:'2026-01-01',updated_at:'2026-01-01',deleted_at:null,workspace_revision:4};
function view(p:Partial<HrSettingsLookupProps>={}) {
 return render(<FluentProvider theme={webLightTheme}><QueryClientProvider client={new QueryClient()}><WorkspaceUiMemoryProvider><HrSettingsLookupPage entity="hr_leave_types" principalId={1} title="Leave Types" description="Synthetic" breadcrumbs={[]} initialData={[]} canManage onList={m.list} onCreate={m.create} onUpdate={m.update} {...p}/></WorkspaceUiMemoryProvider></QueryClientProvider></FluentProvider>);
}
beforeEach(()=>{vi.resetAllMocks();m.list.mockResolvedValue({success:true,data:{data:[],total:0}});m.categories.mockResolvedValue({success:true,data:{data:[],total:0}});m.create.mockResolvedValue({success:true,data:{id:20,entity:'hr_leave_types',revision:'1',changed:true,replayed:false}});m.update.mockResolvedValue({success:true,data:{id:20,entity:'hr_leave_types',revision:'5',changed:true,replayed:false}});});
afterEach(cleanup);
function open(){fireEvent.click(screen.getByRole('button',{name:'Add',exact:true}));fireEvent.change(screen.getByLabelText('Code'),{target:{value:'F06_OPTIONS'}});fireEvent.change(screen.getByLabelText('Name (English)'),{target:{value:'Synthetic options'}});}
it('training types expose category selection instead of silently omitting the relationship',async()=>{view({entity:'hr_training_types',title:'Training Types'});open();await waitFor(()=>expect((screen.getByLabelText('Training category') as HTMLSelectElement).disabled).toBe(false));});
it('category dialog uses the correct singular name',()=>{view({entity:'hr_training_categories',title:'Training Categories'});open();expect(screen.getByRole('heading',{name:'Add Training Category'})).toBeTruthy();});
it('selected training category reaches the save payload as a number',async()=>{m.categories.mockResolvedValue({success:true,data:{data:[{...base,id:72,name_en:'Safety',is_active:true}],total:1}});view({entity:'hr_training_types',title:'Training Types'});open();await screen.findByRole('option',{name:'Safety'});fireEvent.change(screen.getByLabelText('Training category'),{target:{value:'72'}});fireEvent.click(screen.getByRole('button',{name:'Add',exact:true}));await waitFor(()=>expect(m.create).toHaveBeenCalledOnce());expect(m.create.mock.calls[0][0].training_category_id).toBe(72);});
it('category load failure blocks saving rather than silently removing the relationship',async()=>{m.categories.mockRejectedValue(Error('PRIVATE'));view({entity:'hr_training_types',title:'Training Types'});open();await screen.findByText(/Training categories could not load/);expect((screen.getByRole('button',{name:'Add',exact:true}) as HTMLButtonElement).disabled).toBe(true);expect(document.body.textContent).not.toContain('PRIVATE');m.categories.mockResolvedValue({success:true,data:{data:[],total:0}});fireEvent.click(screen.getByRole('button',{name:'Retry categories'}));await waitFor(()=>expect((screen.getByRole('button',{name:'Add',exact:true}) as HTMLButtonElement).disabled).toBe(false));});
it('inactive stored category remains named and unchanged unless explicitly cleared',async()=>{view({entity:'hr_training_types',title:'Training Types',initialData:[{...base,training_category_id:72,training_category:{id:72,name_en:'Historical safety'}}]});fireEvent.click(screen.getByRole('button',{name:'Edit record'}));await waitFor(()=>expect((screen.getByLabelText('Training category') as HTMLSelectElement).disabled).toBe(false));expect((screen.getByLabelText('Training category') as HTMLSelectElement).value).toBe('72');expect(screen.getByRole('option',{name:/Historical safety/})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));await waitFor(()=>expect(m.update).toHaveBeenCalledOnce());expect(m.update.mock.calls[0][1].training_category_id).toBe(72);});
it('leave options preserve explicit false, zero and selected reset basis',async()=>{
 view();open();fireEvent.click(screen.getByRole('switch',{name:'Paid leave',exact:true}));
 fireEvent.click(screen.getByRole('switch',{name:'Approval required',exact:true}));
 fireEvent.change(screen.getByLabelText('Default entitlement (days)'),{target:{value:'0'}});
 fireEvent.change(screen.getByLabelText('Entitlement reset'),{target:{value:'manual'}});
 fireEvent.click(screen.getByRole('button',{name:'Add',exact:true}));
 await waitFor(()=>expect(m.create).toHaveBeenCalledOnce());
 expect(m.create.mock.calls[0][0]).toMatchObject({is_paid:false,requires_approval:false,default_entitlement_days:0,reset_basis:'manual'});
});
it('editing does not silently replace stored false options with defaults',async()=>{
 view({initialData:[{...base,is_paid:false,requires_document:true,requires_approval:false,default_entitlement_days:0,reset_basis:'manual',allow_half_day:false} as typeof base]});
 fireEvent.click(screen.getByRole('button',{name:'Edit record'}));
 expect(screen.getByRole('switch',{name:'Paid leave',exact:true}).getAttribute('aria-checked')).toBe('false');
 expect((screen.getByLabelText('Default entitlement (days)') as HTMLInputElement).value).toBe('0');
 fireEvent.change(screen.getByLabelText('Name (English)'),{target:{value:'Changed name'}});
 fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
 await waitFor(()=>expect(m.update).toHaveBeenCalledOnce());
 expect(m.update.mock.calls[0][1]).toMatchObject({is_paid:false,requires_document:true,requires_approval:false,default_entitlement_days:0,reset_basis:'manual',allow_half_day:false});
});
it('grade level is editable and may be explicitly cleared without changing identity',async()=>{
 view({entity:'hr_grades',title:'Grades',initialData:[{...base,grade_level:3} as typeof base]});
 fireEvent.click(screen.getByRole('button',{name:'Edit record'}));
 fireEvent.change(screen.getByLabelText('Grade level'),{target:{value:''}});
 fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
 await waitFor(()=>expect(m.update).toHaveBeenCalledOnce());expect(m.update.mock.calls[0][1]).toHaveProperty('grade_level',null);
 expect(m.update.mock.calls[0][1]).not.toHaveProperty('code');
});
it('out-of-range expiry alert uses linked validation and makes no server call',async()=>{
 view({entity:'hr_identity_document_types',title:'Identity Document Types'});open();
 fireEvent.change(screen.getByLabelText('Expiry alert (days before expiry)'),{target:{value:'366'}});
 fireEvent.click(screen.getByRole('button',{name:'Add',exact:true}));
 expect(m.create).not.toHaveBeenCalled();expect(await screen.findByRole('alert')).toBeTruthy();
});
it('blank optional validity is null, not zero',async()=>{
 view({entity:'hr_medical_record_types',title:'Medical Record Types'});open();
 expect((screen.getByLabelText('Default validity (months)') as HTMLInputElement).value).toBe('');
 fireEvent.click(screen.getByRole('button',{name:'Add',exact:true}));
 await waitFor(()=>expect(m.create).toHaveBeenCalledOnce());expect(m.create.mock.calls[0][0]).toHaveProperty('default_validity_months',null);
});
for(const entity of Object.keys(hrLookupOptionFields) as HrLookupTable[])it(entity+': all approved configuration controls are rendered and submitted',async()=>{
 m.create.mockResolvedValue({success:true,data:{id:20,entity,revision:'1',changed:true,replayed:false}});
 view({entity,title:'Configuration Records'});open();
 for(const field of hrLookupOptionFields[entity]??[]){
  if(field.kind==='flag')expect(screen.getByRole('switch',{name:field.label,exact:true})).toBeTruthy();
  else expect(screen.getByLabelText(field.label,{exact:true})).toBeTruthy();
 }
 await waitFor(()=>expect((screen.getByRole('button',{name:'Add',exact:true}) as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Add',exact:true}));
 await waitFor(()=>expect(m.create).toHaveBeenCalledOnce());
 expect(m.create.mock.calls[0][0]).toMatchObject(hrLookupOptionPayload(entity,initialHrLookupOptions(entity)));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
it('uncertain option changes freeze every control and recover the exact original submission',async()=>{
 m.create.mockRejectedValueOnce(Error('Synthetic response loss'));view();open();
 fireEvent.click(screen.getByRole('switch',{name:'Paid leave',exact:true}));fireEvent.change(screen.getByLabelText('Default entitlement (days)'),{target:{value:'0.5'}});
 fireEvent.click(screen.getByRole('button',{name:'Add',exact:true}));await screen.findByText(/Save unconfirmed/);
 expect((screen.getByLabelText('Entitlement reset') as HTMLSelectElement).disabled).toBe(true);
 const first=m.create.mock.calls[0];fireEvent.click(screen.getByRole('button',{name:'Retry same save'}));
 await waitFor(()=>expect(m.create).toHaveBeenCalledTimes(2));expect(m.create.mock.calls[1]).toEqual(first);
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
it('an incomplete edit projection disables missing options and leaves them out of the patch',async()=>{
 view({initialData:[base]});fireEvent.click(screen.getByRole('button',{name:'Edit record'}));
 expect((screen.getByLabelText('Entitlement reset') as HTMLSelectElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Name (English)'),{target:{value:'Only name changed'}});
 fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));await waitFor(()=>expect(m.update).toHaveBeenCalledOnce());
 for(const key of ['is_paid','requires_approval','reset_basis','default_entitlement_days'])expect(m.update.mock.calls[0][1]).not.toHaveProperty(key);
});
