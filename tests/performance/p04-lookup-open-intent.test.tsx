// @vitest-environment jsdom
import '../remediation/f05/setup';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { LookupSelect } from '@/components/erp/lookup-select';
let client:QueryClient;
const incoming=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/lib/reads/client',async(original)=>({...await original<typeof import('@/lib/reads/client')>(),readJson:incoming.read}));
const active={id:1,value_code:'ACTIVE',value_label_en:'Active label',is_active:true};
const retired={id:2,value_code:'RETIRED',value_label_en:'Retained label',is_active:false};
beforeEach(()=>{
 incoming.read.mockReset();
 incoming.read.mockImplementation(async(_resource:string,criteria:{selected?:number})=>({success:true,data:criteria.selected ? (criteria.selected===2?[retired]:[active]) : [active]}));
 client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:120000}}});
});
afterEach(()=>{cleanup();client.clear();});
it('cold disabled lookup with historical selected label sends exactly one authorized point read',async()=>{
 const change=vi.fn();
 render(<QueryClientProvider client={client}><LookupSelect ariaLabel="Read-only lookup" categoryCode="SYNTHETIC" value={2} disabled onValueChange={change}/></QueryClientProvider>);
 await waitFor(()=>expect(incoming.read).toHaveBeenCalledTimes(1));
 expect(incoming.read.mock.calls[0][0]).toBe('lookup-values');
 expect(incoming.read.mock.calls[0][1]).toMatchObject({categoryCode:'SYNTHETIC',selected:2,valueField:'id'});
 const button=await screen.findByRole('combobox',{name:'Read-only lookup'});
 expect(button.textContent).toContain('Retained label');
 expect(button.getAttribute('aria-expanded')).toBe('false');
 expect(change).not.toHaveBeenCalled();
});
it('two closed consumers of the same cold active lookup coalesce one request',async()=>{
 const change=vi.fn();
 render(<QueryClientProvider client={client}><LookupSelect ariaLabel="First lookup" categoryCode="SYNTHETIC" value={1} onValueChange={change}/>
  <LookupSelect ariaLabel="Second lookup" categoryCode="SYNTHETIC" value={1} onValueChange={change}/></QueryClientProvider>);
 await waitFor(()=>expect(screen.getByRole('combobox',{name:'Second lookup'}).textContent).toContain('Active label'));
 expect(incoming.read).toHaveBeenCalledTimes(1);expect(change).not.toHaveBeenCalled();
});


it("loads full choices only after the open intent", async () => {
  const change = vi.fn();
  render(<QueryClientProvider client={client}>
    <LookupSelect ariaLabel="Initially empty lookup" categoryCode="SYNTHETIC" value={null} onValueChange={change} />
  </QueryClientProvider>);
  expect(incoming.read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("combobox", { name: "Initially empty lookup" }));
  expect(await screen.findByRole("option", { name: "Active label" })).toBeTruthy();
  expect(incoming.read).toHaveBeenCalledOnce();
  expect(incoming.read.mock.calls[0][1]).not.toHaveProperty("selected");
  expect(change).not.toHaveBeenCalled();
});
