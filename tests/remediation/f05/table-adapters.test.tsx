// @vitest-environment jsdom
import './setup';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useState } from 'react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { getCoreRowModel, useReactTable, type ColumnOrderState } from '@tanstack/react-table';
import { ERPColumnMenu } from '@/components/erp/table/erp-column-menu';
import { WorkspaceUiMemoryProvider } from '@/hooks/use-persistent-ui-state';
import { useSortPaginate } from '@/hooks/use-sort-paginate';
afterEach(cleanup);
it('TanStack adapter restores schema order, not the current reordered defaults',()=>{
 function Fixture(){
  const [order,setOrder]=useState<ColumnOrderState>(['status','code','name']);
  const table=useReactTable({data:[{code:'C1',name:'Synthetic',status:'Draft'}],columns:[{accessorKey:'code',header:'Code'},{accessorKey:'name',header:'Name'},{accessorKey:'status',header:'Status'}],getCoreRowModel:getCoreRowModel(),state:{columnOrder:order},onColumnOrderChange:setOrder});
  return <FluentProvider theme={webLightTheme}><ERPColumnMenu table={table}/><output>{table.getAllLeafColumns().map(c=>c.id).join(',')}</output></FluentProvider>;
 }
 render(<Fixture/>);expect(screen.getByRole('status').textContent).toBe('status,code,name');fireEvent.click(screen.getByRole('button',{name:'Edit columns'}));fireEvent.click(screen.getByRole('button',{name:'Restore defaults'}));fireEvent.click(screen.getByRole('button',{name:'Apply'}));expect(screen.getByRole('status').textContent).toBe('code,name,status');
});
it('opted-in sort/page state returns after unmount but resets for a different principal',()=>{
 function Consumer(){const table=useSortPaginate([{id:2},{id:1},{id:3}],{memoryKey:'synthetic',defaultPageSize:1});return <><button onClick={()=>table.toggleSort('id')}>Sort</button><button onClick={()=>table.setPage(2)}>Page</button><output>{table.sortKey}:{table.page}:{table.rows[0].id}</output></>;}
 function Fixture({show}:{show:boolean}){return show?<Consumer/>:null;}
 const ui=render(<WorkspaceUiMemoryProvider key="a"><Fixture show/></WorkspaceUiMemoryProvider>);fireEvent.click(screen.getByText('Sort'));fireEvent.click(screen.getByText('Page'));expect(screen.getByRole('status').textContent).toBe('id:2:2');
 ui.rerender(<WorkspaceUiMemoryProvider key="a"><Fixture show={false}/></WorkspaceUiMemoryProvider>);ui.rerender(<WorkspaceUiMemoryProvider key="a"><Fixture show/></WorkspaceUiMemoryProvider>);expect(screen.getByRole('status').textContent).toBe('id:2:2');
 ui.rerender(<WorkspaceUiMemoryProvider key="b"><Fixture show/></WorkspaceUiMemoryProvider>);expect(screen.getByRole('status').textContent).toBe(':1:2');
});
