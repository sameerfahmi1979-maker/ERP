// @vitest-environment jsdom
import '../remediation/f05/setup';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ERPCombobox } from '@/components/erp/combobox/erp-combobox';
import { ERPDataTable } from '@/components/erp/table/erp-data-table';
import { WorkspaceUiMemoryProvider } from '@/hooks/use-persistent-ui-state';
const marks=vi.hoisted(()=>({ sample:0, projection:[] as Array<{data?:object[];localRows?:{count:number;load:()=>object[]}}> }));
vi.mock('next/navigation',()=>({usePathname:()=>'/synthetic/table'}));
vi.mock('@/components/erp/export/erp-export-menu',()=>({ERPExportMenu:(props:{data?:object[];localRows?:{count:number;load:()=>object[]}})=>{marks.projection.push(props);return <span>Export control</span>;}}));
vi.mock('@tanstack/react-table',async(original)=>{
 const actual:any=await original();
 const wrapped=new WeakSet<object>();
 return {...actual,useReactTable:(opts:any)=>{
  const table=actual.useReactTable(opts);
  if(!wrapped.has(table)){
   wrapped.add(table);
   const core=table.getCoreRowModel.bind(table);
   table.getCoreRowModel=()=>{
    const result=core();
    for(const row of result.flatRows){
      if(wrapped.has(row)) continue;
      wrapped.add(row);
      const getValue=row.getValue.bind(row);
      row.getValue=(...args:any[])=>{
        marks.sample++;
        return getValue(...args);
      };
    }
    return result;
   };
  }
  return table;
 }};
});
afterEach(()=>{cleanup();marks.sample=0;marks.projection=[];});
it.each([200,1000])('keeps a 50-choice cap for a broad search over %i options',async(count)=>{
 const options=Array.from({length:count},(_,i)=>({value:i+1,label:'Matching Supplier '+(i+1)}));
 const renderer=vi.fn(option=><span>{option.label}</span>);
 const choice=vi.fn();
 render(<ERPCombobox options={options} value={count} onValueChange={choice} ariaLabel="Synthetic supplier" searchPlaceholder="Search supplier" maxVisibleOptions={50} renderOption={renderer}/>);
 fireEvent.click(screen.getByRole('combobox',{name:'Synthetic supplier'}));
 const input=screen.getByPlaceholderText('Search supplier');
 const list=screen.getByRole('listbox');
 expect(within(list).getAllByRole('option')).toHaveLength(50);
 expect(within(list).getByText('Matching Supplier '+count)).toBeTruthy();
 renderer.mockClear();
 fireEvent.change(input,{target:{value:'Matching Supplier'}});
 await waitFor(()=>expect(within(list).getAllByRole('option')).toHaveLength(50));

 fireEvent.change(input,{target:{value:'Matching Supplier '+count}});
 expect(within(list).getAllByRole('option')).toHaveLength(1);

});
it.each([[25,25],[100,100],[1000,25]])('avoids rebuilding a %i-row projection when unrelated toolbar markup changes, page size %i',(rows,pageSize)=>{
 const data=Array.from({length:rows},(_,i)=>({id:i+1,one:'one-'+i,two:'two-'+i,three:'three-'+i,four:'four-'+i}));
 const cols=['one','two','three','four'].map(key=>({id:key,accessorKey:key,header:key,cell:()=>key}));
 const cfg={title:'Synthetic',filename:'test'};
 const app=(noise:string)=><FluentProvider theme={webLightTheme}><WorkspaceUiMemoryProvider><ERPDataTable tableId="probe-table" data={data} columns={cols} initialPageSize={pageSize} exportConfig={cfg} toolbarSlot={<span>{noise}</span>} enableRowSelection={false}/></WorkspaceUiMemoryProvider></FluentProvider>;
 const test=render(app('Before'));
 const prior=marks.projection.at(-1)!;
 marks.projection=[];
 const before=marks.sample;
 test.rerender(app('After'));
 expect(screen.getByText('After')).toBeTruthy();
 const renders=marks.projection.length;
 expect(renders).toBeGreaterThanOrEqual(1);
 expect(marks.projection.at(-1)?.data).toBeUndefined();
 expect(prior.localRows?.count).toBe(rows);
 expect(marks.sample-before).toBe(0);
 expect(marks.projection.at(-1)?.localRows?.load()).toEqual(data);

});
