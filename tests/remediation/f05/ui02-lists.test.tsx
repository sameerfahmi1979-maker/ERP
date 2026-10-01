// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { WorkspaceUiMemoryProvider } from '@/hooks/use-persistent-ui-state';
import { filterDmsRows, dmsListValue, type DmsListField } from '@/features/dms/dms-list-view';
import { DmsCategoriesTable } from '@/features/dms/admin/dms-categories-table';
import { DmsBatchListClient } from '@/features/dms/upload/dms-batch-list-client';
import type { AuthContext } from '@/lib/rbac/check';
import type { DmsCategoryRow } from '@/server/actions/dms/categories';
import type { DmsUploadBatchListRow } from '@/server/actions/dms/batch-intake';
import type { ReactNode } from 'react';
const mocks=vi.hoisted(()=>({create:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mocks.refresh,push:vi.fn()}),usePathname:()=>'/dms/test'}));
vi.mock('@/server/actions/dms/categories',()=>({createDmsCategory:mocks.create,updateDmsCategory:mocks.create,activateDmsCategory:vi.fn(),deactivateDmsCategory:vi.fn(),deleteDmsCategory:vi.fn()}));
function Wrap({children}:{children:ReactNode}){return <FluentProvider theme={webLightTheme}><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></FluentProvider>;}
const auth={permissionCodes:['dms.admin'],roleCodes:[]} as AuthContext;
const rows=[{id:1,category_code:'SYN_A',name_en:'Synthetic Alpha',sort_order:0,is_active:true,is_system:false},{id:2,category_code:'SYN_B',name_en:'Synthetic Beta',sort_order:1,is_active:false,is_system:false}] as DmsCategoryRow[];
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();sessionStorage.clear();});afterEach(cleanup);
const fields:DmsListField[]=[{id:'title',label:'Title',path:'title'},{id:'count',label:'Count',path:'count',type:'number'},{id:'active',label:'Active',path:'active',type:'select'},{id:'date',label:'Date',path:'nested.date',type:'date'}];
const values=[{title:'One',count:10,active:true,nested:{date:'2026-09-30T12:00:00Z'}},{title:'Two',count:100,active:false,nested:null}];
it.each([
 [{count:'10'},'',1],[{active:'false'},'',1],[{date:'2026-09-30'},'',1],[{title:'ONE'},'',1],[{unknown:'ignored'},'',2],[{},'two',1],[{count:'bad'},'',0],[{date:'2026-09-30',active:'false'},'',0],
] as const)('loaded-row filter combines exact typed criteria: %j', (criteria,search,count)=>{expect(filterDmsRows(values,fields,criteria,search)).toHaveLength(count);});
it('missing nested fields and structured values never become searchable record dumps',()=>{expect(dmsListValue(values[1],'nested.date')).toBe('');expect(dmsListValue(values[0],'nested')).toBe('');});
it('category columns reorder/hide real cells; required identity remains',()=>{
 render(<Wrap><DmsCategoriesTable rows={rows} authContext={auth}/></Wrap>);fireEvent.click(screen.getByRole('button',{name:'Edit columns'}));expect((screen.getByRole('checkbox',{name:'Code (required)'}) as HTMLInputElement).disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox',{name:'Description'}));fireEvent.click(screen.getByRole('button',{name:'Move Name up'}));fireEvent.click(screen.getByRole('button',{name:'Apply'}));
 const headers=screen.getAllByRole('columnheader');expect(headers[0].textContent).toBe('Name');expect(headers.some(x=>x.textContent==='Description')).toBe(false);expect(screen.getAllByRole('row')[1].children[0].textContent).toContain('Synthetic Alpha');
});
it('category typed filters run before paging; clearing recovers records without storage writes',()=>{
 render(<Wrap><DmsCategoriesTable rows={rows} authContext={auth}/></Wrap>);fireEvent.click(screen.getByRole('button',{name:'Edit filters'}));fireEvent.change(screen.getByLabelText('Active'),{target:{value:'false'}});fireEvent.click(screen.getByRole('button',{name:'Apply'}));expect(screen.queryByText('Synthetic Alpha')).toBeNull();expect(screen.getByText('Synthetic Beta')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Clear all filters'}));expect(screen.getByText('Synthetic Alpha')).toBeTruthy();expect(localStorage.length+sessionStorage.length).toBe(0);
});
it('read-only category table exposes neither editor nor mutation controls',()=>{render(<Wrap><DmsCategoriesTable rows={rows} authContext={{permissionCodes:[],roleCodes:[]} as unknown as AuthContext}/></Wrap>);expect(screen.queryByRole('button',{name:'Add Category'})).toBeNull();expect(screen.queryByRole('button',{name:'Edit',exact:true})).toBeNull();});
it('missing category fields get the global linked summary without a save',()=>{
 render(<Wrap><DmsCategoriesTable rows={[]} authContext={auth}/></Wrap>);fireEvent.click(screen.getByRole('button',{name:'Add Category'}));fireEvent.click(screen.getByRole('button',{name:'Add',exact:true}));expect(screen.getByRole('alert').textContent).toContain('Check 2 fields');expect(mocks.create).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:/Name \(English\):/}));expect(document.activeElement).toBe(screen.getByLabelText('Name (English)'));
});
it('category save failure is durable, preserves entries and releases the submitting lock',async()=>{
 mocks.create.mockRejectedValue(new Error('private backend detail'));render(<Wrap><DmsCategoriesTable rows={[]} authContext={auth}/></Wrap>);fireEvent.click(screen.getByRole('button',{name:'Add Category'}));fireEvent.change(screen.getByLabelText('Category Code'),{target:{value:'SYN'}});fireEvent.change(screen.getByLabelText('Name (English)'),{target:{value:'Synthetic retained'}});fireEvent.click(screen.getByRole('button',{name:'Add',exact:true}));await screen.findByText(/The save could not be confirmed/);expect((screen.getByLabelText('Name (English)') as HTMLInputElement).value).toBe('Synthetic retained');expect((screen.getByRole('button',{name:'Add',exact:true}) as HTMLButtonElement).disabled).toBe(false);expect(screen.queryByText('private backend detail')).toBeNull();
});
it('batch refresh consumes new server props instead of frozen initial state',async()=>{
 const batch={id:1,batch_code:'SYN_BATCH',status:'processing',total_files:1,pendingCount:1,approvedCount:0,discardedCount:0,created_at:'2026-09-30T12:00:00Z'} as DmsUploadBatchListRow;
 const view=render(<Wrap><DmsBatchListClient initialBatches={[batch]}/></Wrap>);view.rerender(<Wrap><DmsBatchListClient initialBatches={[{...batch,status:'completed',pendingCount:0,approvedCount:1}]}/></Wrap>);await waitFor(()=>expect(screen.getByText('completed')).toBeTruthy());expect(screen.queryByText('processing')).toBeNull();
});
