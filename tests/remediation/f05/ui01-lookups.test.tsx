// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UnitOfMeasureSelect } from '@/components/erp/uom/unit-of-measure-select';
import { collectWorkspaceFieldIssues } from '@/lib/workspace/form-validation';
const state=vi.hoisted(()=>({empty:false,error:null as string|null,retry:vi.fn()}));
vi.mock('@/hooks/lookups',()=>({useUnitsOfMeasureQuery:()=>({data:state.empty?[]:[{id:1,unit_name_en:'Synthetic unit',unit_code:'SYN',symbol:'s'}],options:[],isLoading:false,isFetching:false,error:state.error,refetch:state.retry})}));
beforeEach(()=>{state.empty=false;state.error=null;state.retry.mockClear();});
afterEach(cleanup);
it('required conversion units identify both missing selections without saving',()=>{
 const ui=render(<form><UnitOfMeasureSelect name="from_uom_id" ariaLabel="From Unit" value={null} onValueChange={vi.fn()} required/><UnitOfMeasureSelect name="to_uom_id" ariaLabel="To Unit" value={null} onValueChange={vi.fn()} required/></form>);
 expect(collectWorkspaceFieldIssues(ui.container.querySelector('form')!).map(issue=>issue.label)).toEqual(['From Unit','To Unit']);expect(screen.getByRole('combobox',{name:'From Unit'})).toBeTruthy();
});
it('view-only unit controls do not invent editable validation errors',()=>{
 const ui=render(<form><UnitOfMeasureSelect name="from_uom_id" ariaLabel="From Unit" value={null} required disabled/></form>);
 expect(collectWorkspaceFieldIssues(ui.container.querySelector('form')!)).toHaveLength(0);
});
it('empty units remain focusable and required with truthful guidance and retry',()=>{
 state.empty=true;const ui=render(<form><UnitOfMeasureSelect name="unit" ariaLabel="Unit" value={null} required/></form>);
 expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(false);
 expect(screen.getByRole('status').textContent).toContain('No active units are available');expect(screen.queryByText('Select category first')).toBeNull();
 expect(collectWorkspaceFieldIssues(ui.container.querySelector('form')!)).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'Retry Unit'}));expect(state.retry).toHaveBeenCalledOnce();
});
it('lookup failure is not an empty success and remains retryable',()=>{
 state.empty=true;state.error='Synthetic unavailable';render(<UnitOfMeasureSelect name="unit" ariaLabel="Unit" value={null} required/>);
 expect(screen.getByText('Units could not be loaded. Retry before saving.')).toBeTruthy();expect(screen.queryByText(/No active units/)).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Retry Unit'}));expect(state.retry).toHaveBeenCalledOnce();
});
