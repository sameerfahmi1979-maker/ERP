// @vitest-environment jsdom
import '../f05/setup';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/actions/master-data/parties',()=>({getPartySelectOptions:m.read}));
import {PartySelect} from '@/components/erp/party-select';
import {savedSelection,withSavedSelection} from '@/lib/master-data/saved-selection';
let qc:QueryClient;
beforeEach(()=>{qc=new QueryClient({defaultOptions:{queries:{retry:false}}});vi.clearAllMocks();});afterEach(()=>{cleanup();qc.clear();});
it('real query failures are not cached as empty successes; saved parent remains visible',async()=>{
 m.read.mockResolvedValue({success:false,error:'PRIVATE backend error'});
 render(<QueryClientProvider client={qc}><PartySelect value={71} savedSelection={{value:71,label:'Retired parent'}} onValueChange={vi.fn()}/></QueryClientProvider>);
 await waitFor(()=>expect(screen.getByText(/Party choices could not be loaded/)).not.toBeNull());
 expect(screen.getByRole('combobox').textContent).toContain('Retired parent (saved selection)');
 expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true);
 expect(qc.getQueryCache().getAll()[0].state.status).toBe('error');expect(screen.queryByText('PRIVATE backend error')).toBeNull();
});
it('saved parent is display-only and not silently reselected when switching to an active parent',async()=>{
 const changed=vi.fn();m.read.mockResolvedValue({success:true,data:[{id:72,display_name:'Active parent',party_code:'F06-72'}]});
 render(<QueryClientProvider client={qc}><PartySelect value={71} savedSelection={{value:71,label:'Retired parent'}} onValueChange={changed}/></QueryClientProvider>);
 await waitFor(()=>expect(qc.getQueryCache().getAll()[0].state.status).toBe('success'));
 fireEvent.click(screen.getByRole('combobox'));
 expect(screen.getByRole('option',{name:/Retired parent/}).getAttribute('aria-disabled')).toBe('true');
 fireEvent.click(screen.getByRole('option',{name:'Active parent'}));expect(changed).toHaveBeenCalledExactlyOnceWith(72);
 expect(m.read).toHaveBeenCalledWith(expect.objectContaining({includeInactive:false}));
});
it('a disabled view shows its authorized parent without fetching wider choices',()=>{
 render(<QueryClientProvider client={qc}><PartySelect disabled value={71} savedSelection={{value:71,label:'Retired parent'}} onValueChange={vi.fn()}/></QueryClientProvider>);
 expect(screen.getByRole('combobox').textContent).toContain('Retired parent (saved selection)');expect(m.read).not.toHaveBeenCalled();
});
it('empty/unavailable labels do not invent a display or replace active options',()=>{
 expect(savedSelection(9,null)).toBeUndefined();expect(savedSelection(null,'Other row')).toBeUndefined();expect(savedSelection(9,'  ')).toBeUndefined();
 const active=[{value:9,label:'Current'}];expect(withSavedSelection(active,9,{value:9,label:'Old'})).toBe(active);
 expect(withSavedSelection([],9,{value:8,label:'Other record'})).toEqual([]);
});
