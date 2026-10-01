// @vitest-environment jsdom
import './setup';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { type ReactNode } from 'react';
import { ERPDataTable } from '@/components/erp/table/erp-data-table';
import { WorkspaceUiMemoryProvider } from '@/hooks/use-persistent-ui-state';
const mocks=vi.hoisted(()=>({exportProps:null as unknown}));
vi.mock('next/navigation',()=>({usePathname:()=>'/synthetic'}));
vi.mock('@/components/erp/export/erp-export-menu',()=>({ERPExportMenu:(props:unknown)=>{mocks.exportProps=props;return null;}}));
function Wrap({children}:{children:ReactNode}){return <FluentProvider theme={webLightTheme}><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></FluentProvider>;}
afterEach(cleanup);
const rows=[{id:1,name:'Alpha',amount:10,active:true,date:'2026-09-30T12:00:00Z'},{id:2,name:'Beta',amount:100,active:false,date:'2026-09-29T12:00:00Z'}];
const columns=[{accessorKey:'name',header:'Name',meta:{exportHeader:'Official name'}},{accessorKey:'amount',header:'Amount'},{accessorKey:'active',header:'Active'},{accessorKey:'date',header:'Date',meta:{filter:{type:'date' as const}}}];
it('numeric and date filters match exactly and reset returns all loaded rows',()=>{
 render(<Wrap><ERPDataTable tableId="t" data={rows} columns={columns} enableRowSelection={false}/></Wrap>);
 expect(screen.getByRole('button',{name:'Name'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Edit filters'}));fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'10'}});fireEvent.change(screen.getByLabelText('Date'),{target:{value:'2026-09-30'}});fireEvent.click(screen.getByRole('button',{name:'Apply'}));expect(screen.getByText('Alpha')).toBeTruthy();expect(screen.queryByText('Beta')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Clear search and filters'}));expect(screen.getByText('Beta')).toBeTruthy();
});
it('server pages are not paginated or locally filtered a second time',()=>{
 render(<Wrap><ERPDataTable tableId="server" data={Array.from({length:40},(_,i)=>({id:i,name:'Row '+i}))} columns={[{accessorKey:'name',header:'Name'}]} serverPaged initialPageSize={10} enableRowSelection={false}/></Wrap>);expect(screen.getAllByRole('row')).toHaveLength(41);expect(screen.queryByRole('button',{name:'Edit filters'})).toBeNull();expect(screen.queryByLabelText('Rows per page')).toBeNull();expect(screen.queryByRole('textbox')).toBeNull();expect(screen.getByRole('button',{name:'Edit columns'})).toBeTruthy();
});
it('filtering a later page clamps safely and empty searches are distinguishable',async()=>{
 render(<Wrap><ERPDataTable tableId="paging" data={rows} columns={columns} initialPageSize={1} pageSizeOptions={[1,2]} enableRowSelection={false}/></Wrap>);fireEvent.click(screen.getByRole('button',{name:'Next'}));expect(screen.getByText('Beta')).toBeTruthy();fireEvent.change(screen.getByRole('textbox',{name:'Search...'}),{target:{value:'Alpha'}});await waitFor(()=>expect(screen.getByText('Alpha')).toBeTruthy());fireEvent.change(screen.getByRole('textbox',{name:'Search...'}),{target:{value:'absent'}});expect(screen.getByText(/No records match your search/)).toBeTruthy();
});
it('required identity stays visible; display columns can be hidden without hiding actions',()=>{
 render(<Wrap><ERPDataTable tableId="columns" data={rows} columns={[...columns,{id:'details',header:'Details',cell:()=> <span>Display</span>},{id:'actions',header:'Actions',cell:()=> <button type="button">Open</button>}]} enableRowSelection={false}/></Wrap>);fireEvent.click(screen.getByRole('button',{name:'Edit columns'}));expect((screen.getByRole('checkbox',{name:'Name (required)'}) as HTMLInputElement).disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox',{name:'Details'}));fireEvent.click(screen.getByRole('button',{name:'Apply'}));expect(screen.queryByText('Display')).toBeNull();expect(screen.getAllByRole('button',{name:'Open'})).toHaveLength(2);
});
it('exports use scalar accessors and describe current-page scope',()=>{
 render(<Wrap><ERPDataTable tableId="export" data={rows} columns={[{id:'identity',header:'Name',accessorFn:(row:typeof rows[number])=>row.name}]} serverPaged exportConfig={{title:'Test',filename:'test'}}/></Wrap>);
 const props=mocks.exportProps as {subtitle:string;columns:{getValue:(r:unknown)=>unknown}[]};expect(props.subtitle).toContain('current loaded page only');expect(props.columns[0].getValue(rows[0])).toBe('Alpha');
});
