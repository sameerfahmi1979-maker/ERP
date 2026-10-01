// @vitest-environment jsdom
import './setup';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ConfiguredRow, EditColumns, EditFilters, normalizeColumns, useListColumns, type ListColumn } from '@/components/erp/table/list-controls';
import { WorkspaceUiMemoryProvider } from '@/hooks/use-persistent-ui-state';
const defaults: ListColumn[] = [{id:'code',label:'Code',visible:true,required:true,width:120},{id:'name',label:'Name',visible:true,width:240},{id:'status',label:'Status',visible:false,width:140}];
afterEach(cleanup);
function Fixture() {
 const [columns,setColumns]=useState(defaults);
 return <FluentProvider theme={webLightTheme}><EditColumns columns={columns} defaults={defaults} onApply={setColumns}/><table><tbody><ConfiguredRow columns={columns}><td data-column="code">C-1</td><td data-column="name">Synthetic</td><td data-column="status">Active</td><td>Open</td></ConfiguredRow></tbody></table></FluentProvider>;
}
it('normalizes preferences against permitted schema and clamps widths',()=>{
 expect(normalizeColumns([{id:'salary',label:'Private',visible:true,width:400},{...defaults[0],visible:false,width:-3}],defaults)).toEqual([{...defaults[0],width:80},defaults[1],defaults[2]]);
});
it('duplicate saved columns cannot duplicate data cells',()=>expect(normalizeColumns([defaults[0],defaults[0]],defaults)).toHaveLength(3));
it('cancel leaves live visibility/order/width unchanged',()=>{
 render(<Fixture/>);fireEvent.click(screen.getByRole('button',{name:'Edit columns'}));fireEvent.click(screen.getByRole('checkbox',{name:'Name'}));fireEvent.click(screen.getByRole('button',{name:'Move Status up'}));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.getAllByRole('cell').map(c=>c.textContent)).toEqual(['C-1','Synthetic','Open']);
});
it('apply changes React cell order and visibility while retaining actions',()=>{
 render(<Fixture/>);fireEvent.click(screen.getByRole('button',{name:'Edit columns'}));fireEvent.click(screen.getByRole('checkbox',{name:'Status'}));fireEvent.click(screen.getByRole('button',{name:'Move Status up'}));fireEvent.click(screen.getByRole('button',{name:'Apply'}));expect(screen.getAllByRole('cell').map(c=>c.textContent)).toEqual(['C-1','Active','Synthetic','Open']);
});
it('required identity cannot be hidden and restore needs Apply',()=>{
 render(<Fixture/>);fireEvent.click(screen.getByRole('button',{name:'Edit columns'}));expect((screen.getByRole('checkbox',{name:'Code (required)'}) as HTMLInputElement).disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox',{name:'Name'}));fireEvent.click(screen.getByRole('button',{name:'Apply'}));fireEvent.click(screen.getByRole('button',{name:'Edit columns'}));fireEvent.click(screen.getByRole('button',{name:'Restore defaults'}));expect(screen.getAllByRole('cell')).toHaveLength(2);fireEvent.click(screen.getByRole('button',{name:'Apply'}));expect(screen.getAllByRole('cell')).toHaveLength(3);
});
it('width editing permits clearing and typing before validating Apply',()=>{
 const apply=vi.fn();render(<FluentProvider theme={webLightTheme}><EditColumns columns={defaults} defaults={defaults} onApply={apply}/></FluentProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Edit columns'}));const input=screen.getByRole('spinbutton',{name:'Name width'});
 fireEvent.change(input,{target:{value:''}});expect((input as HTMLInputElement).value).toBe('');expect((screen.getByRole('button',{name:'Apply'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(input,{target:{value:'2'}});expect((input as HTMLInputElement).value).toBe('2');expect(apply).not.toHaveBeenCalled();
 fireEvent.change(input,{target:{value:'220'}});fireEvent.click(screen.getByRole('button',{name:'Apply'}));expect(apply.mock.calls[0][0][1].width).toBe(220);
});
it('filters only call the adapter after Apply, not draft edits or Cancel',()=>{
 const apply=vi.fn();render(<FluentProvider theme={webLightTheme}><EditFilters definitions={[{id:'status',label:'Status',type:'select',options:[{value:'active',label:'Active'}]}]} values={{}} onApply={apply} scopeLabel="Server results."/></FluentProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Edit filters'}));fireEvent.change(screen.getByLabelText('Status'),{target:{value:'active'}});expect(apply).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(apply).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Edit filters'}));expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('');fireEvent.change(screen.getByLabelText('Status'),{target:{value:'active'}});fireEvent.click(screen.getByRole('button',{name:'Apply'}));expect(apply).toHaveBeenCalledWith({status:'active'});
});
it('filter chips remove only their field; clear removes all',()=>{
 const apply=vi.fn();render(<FluentProvider theme={webLightTheme}><EditFilters definitions={[{id:'status',label:'Status',type:'text'},{id:'company',label:'Company',type:'text'}]} values={{status:'active',company:'Synthetic'}} onApply={apply} scopeLabel="Server results."/></FluentProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Remove Status filter'}));expect(apply).toHaveBeenCalledWith({status:'',company:'Synthetic'});fireEvent.click(screen.getByRole('button',{name:'Clear all filters'}));expect(apply).toHaveBeenLastCalledWith({});
});
it('column state is memory-only and a new principal does not inherit it',()=>{
 function Consumer(){const c=useListColumns('synthetic',defaults);return <><button onClick={()=>c.setColumns(c.columns.map(x=>({...x,width:320})))}>Change</button><output>{c.columns[0].width}</output></>;}
 localStorage.clear();const ui=render(<WorkspaceUiMemoryProvider key="a"><Consumer/></WorkspaceUiMemoryProvider>);fireEvent.click(screen.getByText('Change'));expect(screen.getByRole('status').textContent).toBe('320');expect(localStorage.length).toBe(0);ui.rerender(<WorkspaceUiMemoryProvider key="b"><Consumer/></WorkspaceUiMemoryProvider>);expect(screen.getByRole('status').textContent).toBe('120');
});
