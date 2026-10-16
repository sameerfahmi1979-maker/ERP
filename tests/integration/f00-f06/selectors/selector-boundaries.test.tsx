// @vitest-environment jsdom
import {cleanup,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ERPComboboxOption} from '@/components/erp/combobox';
const m=vi.hoisted(()=>({props:null as null|{options:ERPComboboxOption[];disabled:boolean;loading:boolean;onValueChange:(value:number|null)=>void},branches:vi.fn(),units:vi.fn(),error:null as string|null,isLoading:false,unitOptions:[{value:7,label:'Retired unit',disabled:true}] as ERPComboboxOption[]}));
vi.mock('@/components/erp/combobox',()=>({ERPCombobox:(props:typeof m.props)=>{m.props=props;return <div/>;}}));
vi.mock('@/components/erp/query-read-boundary',()=>({QueryReadBoundary:({children}:{children:React.ReactNode})=>children}));
vi.mock('@/components/ui/button',()=>({Button:({children}:{children:React.ReactNode})=><button>{children}</button>}));
vi.mock('@/hooks/lookups',()=>({useBranchesQuery:(args:unknown)=>{m.branches(args);return {options:[{value:9,label:'Shared branch'}],error:m.error,isLoading:m.isLoading,refetch:vi.fn()};},useUnitsOfMeasureQuery:(args:unknown)=>{
 m.units(args);return {data:[{id:7,unit_name_en:'Retired unit',unit_name_ar:null,unit_code:'OLD',symbol:'kg',is_base_unit:false}],options:m.unitOptions,error:m.error,isLoading:m.isLoading,isFetching:false,refetch:vi.fn()};
}}));
import {BranchSelect} from '@/components/erp/organizations/branch-select';
import {UnitOfMeasureSelect} from '@/components/erp/uom/unit-of-measure-select';
beforeEach(()=>{vi.clearAllMocks();m.props=null;m.error=null;m.isLoading=false;m.unitOptions=[{value:7,label:'Retired unit',disabled:true}];});afterEach(cleanup);
it('explicit empty authorized branch choices never fall back to the shared catalogue',()=>{
 render(<BranchSelect value={null} authorizedOptions={[]}/>);
 expect(m.branches).toHaveBeenCalledWith(expect.objectContaining({enabled:false}));expect(m.props!.options).toEqual([]);
});
it('undefined branch choices enable scoped read and carry the retained selected ID',()=>{
 render(<BranchSelect value={9} ownerCompanyId={2}/>);
 expect(m.branches).toHaveBeenCalledWith(expect.objectContaining({enabled:true,selectedId:9,ownerCompanyId:2}));expect(m.props!.options).toHaveLength(1);
});
it('the symbol-labelled unit retains its historical disabled option state',()=>{
 render(<UnitOfMeasureSelect value={7} showSymbol/>);
 expect(m.units).toHaveBeenCalledWith(expect.objectContaining({selectedId:7}));expect(m.props!.options[0]).toMatchObject({value:7,label:'Retired unit (kg)',disabled:true});
});
it('a lean unit is selectable only when its authorized catalogue option is present and enabled',()=>{
 m.unitOptions=[{value:7,label:'Active unit'}];
 const {rerender}=render(<UnitOfMeasureSelect value={7} showSymbol/>);
 expect(m.props!.options[0].disabled).toBe(false);
 m.unitOptions=[];rerender(<UnitOfMeasureSelect value={7} showSymbol/>);
 expect(m.props!.options[0].disabled).toBe(true);
});
it.each([BranchSelect,UnitOfMeasureSelect])('a failed read blocks a stale portaled callback without clearing the saved value',Selector=>{
 m.error='Read failed';const onValueChange=vi.fn();render(<Selector value={7} onValueChange={onValueChange}/>);
 expect(m.props!.disabled).toBe(true);m.props!.onValueChange(null);m.props!.onValueChange(9);expect(onValueChange).not.toHaveBeenCalled();expect(m.props!.options.every(option=>option.disabled)).toBe(true);
});
it('loading does not hide an already selected unit label',()=>{
 m.isLoading=true;render(<UnitOfMeasureSelect value={7}/>);expect(m.props!.loading).toBe(false);
});
