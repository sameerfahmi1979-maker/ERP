// @vitest-environment jsdom
// In-process component tests only: no browser, server, network or live records.
import './setup';
import {createRequire} from 'node:module';
import {afterEach, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {useState, type ReactNode} from 'react';
import {FluentProvider, webDarkTheme, webLightTheme} from '@fluentui/react-components';
import type {ColumnDef} from '@tanstack/react-table';
import {RecordCollection} from '@/components/erp/table/record-collection';
import {ERPDataTable} from '@/components/erp/table/erp-data-table';
import {EmbeddedListNavigation, isVerifiedListTotal} from '@/components/erp/table/embedded-list-navigation';
import {LoadedListTools, useLoadedListView} from '@/components/erp/table/loaded-list-view';
import {TablePagination} from '@/components/erp/table/table-pagination';
import type {ERPTableServerRead} from '@/components/erp/table/erp-table-types';
import {WorkspaceUiMemoryProvider} from '@/hooks/use-persistent-ui-state';

vi.mock('next/navigation',()=>({usePathname:()=>'/synthetic-record/990001'}));
vi.mock('@/components/erp/export/erp-export-menu',()=>({ERPExportMenu:()=>null}));
afterEach(cleanup);
type Row={id:number;name:string;confidential?:string};
const row:Row={id:990001,name:'Synthetic file',confidential:'DO-NOT-DISCOVER'};
const fields=[{id:'name',path:'name',label:'Name'}];
const columns:ColumnDef<Row>[]=[{accessorKey:'name',header:'Name'},{id:'actions',header:'Actions',cell:({row:r})=><button type="button" onClick={()=>actions(r.original.id)}>Open file</button>}];
const actions=vi.fn();
function Wrap({children,dark=false}:{children:ReactNode;dark?:boolean}){
  return <FluentProvider theme={dark?webDarkTheme:webLightTheme}><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></FluentProvider>;
}
function serverRead(overrides:Partial<ERPTableServerRead<Row>>={}):ERPTableServerRead<Row>{
  return {pagination:{pageIndex:0,pageSize:25},sorting:[],globalFilter:'',columnFilters:[],totalCount:1,
    onPaginationChange:vi.fn(),onSortingChange:vi.fn(),onGlobalFilterChange:vi.fn(),onColumnFiltersChange:vi.fn(),filters:[],...overrides};
}
function expectCompact(){
  expect(screen.queryByRole('textbox',{name:/Search/})).toBeNull();
  for(const name of ['Edit columns','Edit filters'])expect(screen.queryByRole('button',{name})).toBeNull();
  expect(screen.queryByLabelText('Rows per page')).toBeNull();
}
it.each([false,true])('record cards render once without master-list chrome (dark=%s)',dark=>{
  render(<Wrap dark={dark}><RecordCollection id="synthetic-files" rows={[row]} fields={fields} renderRecord={r=><div>{r.name}<button type="button" onClick={()=>actions(r.id)}>View</button></div>}/></Wrap>);
  expectCompact();expect(screen.getAllByText(row.name)).toHaveLength(1);expect(screen.queryByRole('navigation')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'View'}));expect(actions).toHaveBeenLastCalledWith(row.id);
  expect(document.body.textContent).not.toContain(row.confidential);
  expect(document.body.textContent).not.toContain('Details and permitted actions');
});
it('main worklists retain search, columns, filters and paging controls',()=>{
  render(<Wrap><RecordCollection presentation="worklist" id="synthetic-main" rows={[row]} fields={fields} renderRecord={r=><span>{r.name}</span>}/></Wrap>);
  expect(screen.getByRole('button',{name:'Edit columns'})).toBeTruthy();expect(screen.getByRole('button',{name:'Edit filters'})).toBeTruthy();expect(screen.getByRole('textbox',{name:'Search loaded records…'})).toBeTruthy();expect(screen.getByLabelText('Rows per page')).toBeTruthy();
});
it('embedded cards retain all rows through simple navigation and keep original indices',()=>{
  const rows=Array.from({length:26},(_,i)=>({id:990100+i,name:`Synthetic ${i}`}));
  render(<Wrap><RecordCollection id="synthetic-pages" rows={rows} fields={fields} renderRecord={(r,i)=><span>{r.name} index {i}</span>}/></Wrap>);
  expect(screen.getAllByRole('listitem')).toHaveLength(25);fireEvent.click(screen.getByRole('button',{name:'Next'}));
  expect(screen.getByText('Synthetic 25 index 25')).toBeTruthy();expect(screen.getAllByRole('listitem')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Previous'}));expect(screen.getByText('Synthetic 0 index 0')).toBeTruthy();expectCompact();
});
it('server cards delegate navigation and do not paginate the loaded page again',()=>{
  const read=serverRead({pagination:{pageIndex:1,pageSize:10},totalCount:61});
  const rows=Array.from({length:10},(_,i)=>({id:990100+i,name:`Server ${i}`}));
  render(<Wrap><RecordCollection id="server-pages" rows={rows} serverRead={read} fields={fields} renderRecord={(r,i)=><span>{r.name}:{i}</span>}/></Wrap>);
  expect(screen.getAllByRole('listitem')).toHaveLength(10);expect(screen.getByText('Page 2 of 7')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Next'}));const update=vi.mocked(read.onPaginationChange).mock.calls[0][0];
  expect(typeof update==='function'&&update(read.pagination)).toEqual({pageIndex:2,pageSize:10});
});
it('local navigation uses the clamped current page after records are removed',()=>{
  const rows=Array.from({length:60},(_,i)=>({id:990100+i,name:`Shrinking ${i}`}));
  const list=(data:typeof rows)=><RecordCollection id="shrinking" rows={data} fields={fields} renderRecord={r=><span>{r.name}</span>}/>;
  const ui=render(<Wrap>{list(rows)}</Wrap>);fireEvent.click(screen.getByRole('button',{name:'Next'}));fireEvent.click(screen.getByRole('button',{name:'Next'}));expect(screen.getByText('Shrinking 50')).toBeTruthy();
  ui.rerender(<Wrap>{list(rows.slice(0,26))}</Wrap>);expect(screen.getByText('Shrinking 25')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Previous'}));expect(screen.getByText('Shrinking 0')).toBeTruthy();expect(screen.getByText('Page 1 of 2')).toBeTruthy();
});
it.each([null,-1,1.5,Number.NaN,Number.POSITIVE_INFINITY])('unverified totals hide stale rows and report failure (%s)',totalCount=>{
  render(<Wrap><RecordCollection id="failed-read" rows={[row]} serverRead={serverRead({totalCount})} fields={fields} renderRecord={r=><span>{r.name}</span>}/></Wrap>);
  expect(screen.queryByText(row.name)).toBeNull();expect(screen.getByRole('alert').textContent).toContain('could not yet be verified');
  expect(screen.queryByText('No related records yet.')).toBeNull();expect(screen.queryByRole('button',{name:'Next'})).toBeNull();
});
it('active server criteria are visible and can be cleared without touching authority',()=>{
  const read=serverRead({globalFilter:'old filter',columnFilters:[{id:'name',value:'old'}]});
  render(<Wrap><RecordCollection id="criteria" rows={[row]} fields={fields} serverRead={read} renderRecord={r=><span>{r.name}</span>}/></Wrap>);
  fireEvent.click(screen.getByRole('button',{name:'Clear list criteria'}));
  expect(read.onGlobalFilterChange).toHaveBeenCalledWith('');expect(read.onColumnFiltersChange).toHaveBeenCalledWith([]);
  expect(read.onSortingChange).not.toHaveBeenCalled();expectCompact();
});
it('loading and application errors stay visible and navigation is disabled while loading',()=>{
  render(<Wrap><RecordCollection id="busy" rows={[row]} serverRead={serverRead({totalCount:50})} fields={fields} isLoading message="This section is unavailable." renderRecord={r=><span>{r.name}</span>}/></Wrap>);
  expect(screen.getByRole('alert').textContent).toBe('This section is unavailable.');expect(screen.getByText('Loading records…')).toBeTruthy();
  expect((screen.getByRole('button',{name:'Next'}) as HTMLButtonElement).disabled).toBe(true);
});
it('successful empty reads are distinct from failures',()=>{
  render(<Wrap><RecordCollection id="empty" rows={[]} serverRead={serverRead({totalCount:0})} fields={fields} renderRecord={r=><span>{r.name}</span>}/></Wrap>);
  expect(screen.getByText('No related records yet.')).toBeTruthy();expect(screen.queryByRole('alert')).toBeNull();expectCompact();
});
it('a pending unverified read is loading rather than a failed or empty collection',()=>{
  render(<Wrap><RecordCollection id="initial-load" rows={[row]} serverRead={serverRead({totalCount:null})} isLoading fields={fields} renderRecord={r=><span>{r.name}</span>}/></Wrap>);
  expect(screen.getByRole('status').textContent).toBe('Loading records…');expect(screen.queryByRole('alert')).toBeNull();expect(screen.queryByText(row.name)).toBeNull();expect(screen.queryByText('No related records yet.')).toBeNull();
});
it('out-of-range server pages provide an explicit recovery action',()=>{
  const change=vi.fn();render(<EmbeddedListNavigation label="Synthetic" total={0} pagination={{pageIndex:3,pageSize:25}} onPaginationChange={change}/>);
  fireEvent.click(screen.getByRole('button',{name:'Return to first page'}));expect(change.mock.calls[0][0]({pageIndex:3,pageSize:25})).toEqual({pageIndex:0,pageSize:25});
});
it('keyed row inputs retain in-flight edits during harmless parent rerenders',()=>{
  function Card(){const [value,setValue]=useState('draft');return <input aria-label="Synthetic draft" value={value} onChange={e=>setValue(e.target.value)}/>;}
  const ui=render(<Wrap><RecordCollection id="stable" rows={[row]} fields={fields} renderRecord={()=><Card/>}/></Wrap>);
  fireEvent.change(screen.getByLabelText('Synthetic draft'),{target:{value:'unsaved edit'}});
  ui.rerender(<Wrap><RecordCollection id="stable" rows={[{...row}]} fields={[...fields]} renderRecord={()=><Card/>}/></Wrap>);
  expect((screen.getByLabelText('Synthetic draft') as HTMLInputElement).value).toBe('unsaved edit');
});
it('permission-aware row actions remain controlled by their original renderer',()=>{
  const ui=render(<Wrap><RecordCollection id="scope" rows={[row]} fields={fields} renderRecord={r=><span>{r.name}<button disabled>Archive</button></span>}/></Wrap>);
  expect((screen.getByRole('button',{name:'Archive'}) as HTMLButtonElement).disabled).toBe(true);
  ui.rerender(<Wrap><RecordCollection id="scope" rows={[row]} fields={fields} renderRecord={r=><span>{r.name}</span>}/></Wrap>);
  expect(screen.queryByRole('button',{name:'Archive'})).toBeNull();
});
it('principal remount clears embedded page memory rather than leaking another account state',()=>{
  const rows=Array.from({length:26},(_,i)=>({id:990100+i,name:`Account row ${i}`}));
  const content=<RecordCollection id="principal" rows={rows} fields={fields} renderRecord={r=><span>{r.name}</span>}/>;
  const ui=render(<Wrap key="A">{content}</Wrap>);fireEvent.click(screen.getByRole('button',{name:'Next'}));expect(screen.getByText('Account row 25')).toBeTruthy();
  ui.rerender(<Wrap key="B">{content}</Wrap>);expect(screen.getByText('Account row 0')).toBeTruthy();expect(screen.queryByText('Account row 25')).toBeNull();
});
it.each([false,true])('explicit embedded tables keep headings/actions but no sorter/toolbars (dark=%s)',dark=>{
  render(<Wrap dark={dark}><ERPDataTable presentation="embedded" tableId="synthetic-table" data={[row]} columns={columns} enableRowSelection={false}/></Wrap>);
  expectCompact();expect(screen.getByRole('columnheader',{name:'Name'})).toBeTruthy();expect(screen.getByRole('columnheader',{name:'Actions'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Name'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Open file'}));expect(actions).toHaveBeenLastCalledWith(row.id);
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(screen.getByRole('table').style.tableLayout).toBe('auto');
});
it('embedded tables retain more-than-one-page navigation',()=>{
  render(<Wrap><ERPDataTable presentation="embedded" tableId="table-pages" data={[row,{id:990002,name:'Second'}]} columns={columns} enableRowSelection={false} initialPageSize={1}/></Wrap>);
  expect(screen.getByText(row.name)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Next'}));expect(screen.getByText('Second')).toBeTruthy();expectCompact();
});
it('compact table state settles after effects instead of repeatedly resetting pagination',async()=>{
  render(<Wrap><ERPDataTable presentation="embedded" tableId="settled" data={[row,{id:990002,name:'Second'}]} columns={columns} enableRowSelection={false} initialPageSize={1}/></Wrap>);
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  fireEvent.click(screen.getByRole('button',{name:'Next'}));
  await waitFor(()=>expect(screen.getByText('Second')).toBeTruthy());
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  expect(screen.getByText('Page 2 of 2')).toBeTruthy();expect(screen.queryByText(row.name)).toBeNull();
});
it('null document IDs use their unique source keys and preserve per-row edits after reordering',()=>{
  const docs=[{id:null,key:'identity:990001',name:'A'},{id:null,key:'identity:990002',name:'B'}];
  function Card({name}:{name:string}){const[value,setValue]=useState(name);return <input aria-label={name} value={value} onChange={e=>setValue(e.target.value)}/>;}
  const list=(rows:typeof docs)=><RecordCollection id="nullable-identities" rows={rows} fields={fields} renderRecord={r=><Card name={r.name}/>}/>;
  const ui=render(<Wrap>{list(docs)}</Wrap>);fireEvent.change(screen.getByLabelText('A'),{target:{value:'A draft'}});
  ui.rerender(<Wrap>{list([...docs].reverse())}</Wrap>);expect((screen.getByLabelText('A') as HTMLInputElement).value).toBe('A draft');expect((screen.getByLabelText('B') as HTMLInputElement).value).toBe('B');
});
it('main-list preferences do not hide rows or columns after a table becomes embedded',()=>{
  const table=(presentation:'worklist'|'embedded')=><ERPDataTable presentation={presentation} tableId="switch-presentation" data={[row]} columns={columns} enableRowSelection={false}/>;
  const ui=render(<Wrap>{table('worklist')}</Wrap>);fireEvent.change(screen.getByRole('textbox',{name:'Search...'}),{target:{value:'nothing matches'}});
  expect(screen.queryByText(row.name)).toBeNull();ui.rerender(<Wrap>{table('embedded')}</Wrap>);expect(screen.getByText(row.name)).toBeTruthy();expectCompact();
});
it('legacy loaded-list adapters ignore hidden preferences after compact adoption',()=>{
  function Fixture({embedded}:{embedded:boolean}){const view=useLoadedListView('synthetic-loaded',[row],fields,{presentation:embedded?'embedded':'worklist'});return <><LoadedListTools view={view} search/><button type="button" onClick={()=>{view.setSearch('no match');view.setColumns(view.columns.map(c=>({...c,visible:false})));}}>Seed old preferences</button><output>{view.rows.length}:{view.visible.length}</output></>;}
  const ui=render(<Wrap><Fixture embedded={false}/></Wrap>);fireEvent.click(screen.getByRole('button',{name:'Seed old preferences'}));expect(screen.getByRole('status').textContent).toBe('0:0');
  ui.rerender(<Wrap><Fixture embedded/></Wrap>);expectCompact();expect(screen.getByRole('status').textContent).toBe('1:1');
});
it('compact legacy pagination hides the single-page footer but retains later pages',()=>{
  const onPage=vi.fn();const ui=render(<Wrap><TablePagination presentation="embedded" page={1} totalPages={1} pageSize={25} total={1} onPage={onPage} onPageSize={vi.fn()}/></Wrap>);
  expect(screen.queryByRole('navigation')).toBeNull();ui.rerender(<Wrap><TablePagination presentation="embedded" page={1} totalPages={2} pageSize={25} total={26} onPage={onPage} onPageSize={vi.fn()}/></Wrap>);
  fireEvent.click(screen.getByRole('button',{name:'Next'}));expect(onPage).toHaveBeenCalledWith(2);expectCompact();
});
it.each([0,1,26])('only non-negative integral totals are verified (%s)',total=>expect(isVerifiedListTotal(total)).toBe(true));
it('the complete source inventory explicitly separates every current shared-table caller',()=>{
  const require=createRequire(import.meta.url);const {audit}=require('../../../tooling/quality/embedded-list-audit.cjs');
  const result=audit();expect(result.filesScanned).toBeGreaterThan(800);
  expect(result.entries.filter((e:{required:boolean;mode:string;actual:string})=>e.required&&e.mode!==e.actual)).toEqual([]);
  for(const file of ['src/features/hr/employees/employee-letters-forms.tsx','src/features/dms/documents/sections/dms-document-ocr-section.tsx','src/features/master-data/parties/party-bank-details-tab.tsx']){
    const entries=result.entries.filter((e:{file:string})=>e.file===file);expect(entries.length).toBeGreaterThan(0);expect(entries.every((e:{mode:string})=>e.mode==='embedded')).toBe(true);
  }
});
