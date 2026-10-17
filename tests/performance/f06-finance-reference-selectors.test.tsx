// @vitest-environment jsdom
// Real controls/hooks/cache; synthetic browser transport only, no runtime.
import '../remediation/f05/setup';
import React from 'react';
import {act,cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {CurrencySelect} from '@/components/erp/finance-basics/currency-select';
import {BankSelect} from '@/components/erp/finance-basics/bank-select';
import {PaymentTermSelect} from '@/components/erp/finance-basics/payment-term-select';
import {TaxTypeSelect} from '@/components/erp/finance-basics/tax-type-select';
import {useCurrenciesQuery,useBanksQuery,usePaymentTermsQuery,useTaxTypesQuery} from '@/hooks/lookups/use-finance-queries';
import {queryKeys} from '@/lib/query/query-keys';
import {registerPrivateCache,clearPrivateCaches} from '@/lib/query/private-cache';
import {fetchCurrencies,fetchPaymentTerms,fetchTaxTypes} from '@/lib/lookups/master-data-fetchers';
import {useWorkspaceSaveSession} from '@/hooks/use-workspace-save-session';
type Row={id:number;[key:string]:unknown};
type Call={table:string;filters:[string,unknown][];from:number;to:number;signal?:AbortSignal};
type Reply={data:Row[]|null;count:number|null;error:{message:string}|null;status:number};
const state=vi.hoisted(()=>({calls:[] as Call[],reply:undefined as undefined|((c:Call)=>Promise<Reply>)}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({from:(table:string)=>{
 const call:Call={table,filters:[],from:0,to:499};const b={select:()=>b,retry:()=>b,order:()=>b,eq:(k:string,v:unknown)=>{call.filters.push([k,v]);return b;},range:(from:number,to:number)=>{call.from=from;call.to=to;return b;},abortSignal:(signal:AbortSignal)=>{call.signal=signal;return b;},then:(resolve:(v:Reply)=>unknown,reject:(e:unknown)=>unknown)=>{state.calls.push(call);return state.reply!(call).then(resolve,reject);}};return b;
}})}));
const row=(id=1,label='Synthetic one'):Row=>({id,currency_code:`C${id}`,currency_name_en:label,currency_name_ar:'عملة',symbol:'S',is_base_currency:false,bank_code:`B${id}`,bank_name_en:label,bank_name_ar:'بنك',short_name:'SHORT',term_code:`T${id}`,term_name_en:label,term_name_ar:'فترة',due_days:0,tax_code:`X${id}`,tax_name_en:label,tax_name_ar:'ضريبة',tax_rate:0});
const ok=(data:Row[]):Reply=>({data,count:data.length,error:null,status:200});
const fail=(status=503):Reply=>({data:null,count:null,error:{message:'PRIVATE DETAIL'},status});
const clients:QueryClient[]=[];
function cache(){const q=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:1,staleTime:60000,gcTime:60000}}});clients.push(q);return q;}
beforeEach(()=>{state.calls=[];state.reply=async()=>ok([row(),row(2,'Synthetic two')]);});
afterEach(()=>{cleanup();clearPrivateCaches();clients.splice(0).forEach(q=>q.clear());});
const controls=[['currency',CurrencySelect,{},queryKeys.currencies(false),useCurrenciesQuery],['bank',BankSelect,{countryId:7},queryKeys.banks(7,false),useBanksQuery],['term',PaymentTermSelect,{},queryKeys.paymentTerms(false),usePaymentTermsQuery],['tax',TaxTypeSelect,{},queryKeys.taxTypes(false),useTaxTypesQuery]] as const;
it.each(controls)('%s portal failure retains value, blocks selection/clear and retries safely',async(_n,Control,props,key)=>{
 const qc=cache(),changed=vi.fn();const v=render(<QueryClientProvider client={qc}><Control {...props} value={1} name="retained" allowClear onValueChange={changed}/></QueryClientProvider>);
 await waitFor(()=>expect(within(v.container).getByRole('combobox').textContent).toContain('Synthetic one'));fireEvent.click(within(v.container).getByRole('combobox'));
 const second=v.getByRole('option',{name:/Synthetic two/});expect(v.container.contains(second)).toBe(false);
 state.reply=async()=>fail();await act(async()=>{await qc.invalidateQueries({queryKey:key,exact:true});});await waitFor(()=>expect(qc.getQueryState(key)?.status).toBe('error'));
 expect(v.getByRole('alert')).toBeTruthy();expect((within(v.container).getByRole('combobox') as HTMLButtonElement).disabled).toBe(true);
 for(const option of v.queryAllByRole('option')){expect(option.getAttribute('aria-disabled')).toBe('true');fireEvent.click(option);}
 const clear=v.queryByRole('button',{name:/Clear/});if(clear)fireEvent.click(clear);expect(changed).not.toHaveBeenCalled();expect((v.container.querySelector('input[name="retained"]') as HTMLInputElement).value).toBe('1');expect(v.container.textContent).not.toContain('PRIVATE');
 state.reply=async()=>ok([row(),row(2,'Synthetic two')]);fireEvent.click(v.getByRole('button',{name:'Retry loading'}));await waitFor(()=>expect(v.queryByRole('alert')).toBeNull());
 if(!v.queryByRole('option',{name:/Synthetic two/}))fireEvent.click(within(v.container).getByRole('combobox'));fireEvent.click(v.getByRole('option',{name:/Synthetic two/}));expect(changed).toHaveBeenCalledExactlyOnceWith(2);
});
it.each(controls)('%s selected history is exact, disabled, scoped and retained without clearing',async(_n,Control,props)=>{
 state.reply=async c=>ok(c.filters.some(([k])=>k==='id')?[row(8,'Retained inactive')]:[row()]);const qc=cache(),changed=vi.fn();const v=render(<QueryClientProvider client={qc}><Control {...props} value={8} name="retained" onValueChange={changed}/></QueryClientProvider>);
 await waitFor(()=>expect(within(v.container).getByRole('combobox').textContent).toContain('Retained inactive'));expect(state.calls).toHaveLength(2);expect(state.calls[1].filters).toEqual([...('countryId'in props?[['country_id',7]]:[]),['id',8]]);
 fireEvent.click(within(v.container).getByRole('combobox'));const option=v.getByRole('option',{name:/Retained inactive/});expect(option.getAttribute('aria-disabled')).toBe('true');fireEvent.click(option);expect(changed).not.toHaveBeenCalled();
});
it.each(controls)('%s current403 hides warm active and selected rows without changing draft ID',async(_n,Control,props,key)=>{
 const qc=cache();qc.setQueryData(key,[row()]);qc.setQueryData([...key,'selected',8],[row(8,'Old history')]);state.reply=async()=>fail(403);
 const v=render(<QueryClientProvider client={qc}><Control {...props} value={8} name="retained" onValueChange={vi.fn()}/></QueryClientProvider>);
 await act(async()=>{await qc.invalidateQueries({queryKey:key});});await waitFor(()=>expect(v.getByRole('alert')).toBeTruthy());expect(v.container.textContent).not.toContain('Old history');expect(v.container.textContent).not.toContain('Synthetic one');expect((v.container.querySelector('input[name="retained"]') as HTMLInputElement).value).toBe('8');
});
it.each(controls)('%s missing saved choice keeps its ID with a neutral explanation, never an invented eligible row',async(_n,Control,props)=>{
 state.reply=async c=>ok(c.filters.some(([k])=>k==='id')?[]:[row()]);const qc=cache(),changed=vi.fn();const v=render(<QueryClientProvider client={qc}><Control {...props} value={8} name="retained" onValueChange={changed}/></QueryClientProvider>);
 await waitFor(()=>expect(v.getByRole('combobox').textContent).toContain('Saved selection unavailable; value retained'));expect((v.container.querySelector('input[name="retained"]') as HTMLInputElement).value).toBe('8');expect(changed).not.toHaveBeenCalled();fireEvent.click(v.getByRole('combobox'));expect(v.getAllByRole('option')).toHaveLength(1);expect(v.getByRole('option').textContent).toContain('Synthetic one');
});
it.each(controls)('%s retains a selected ID during the active catalogue wait',async(_n,Control,props)=>{
 const qc=cache();let finish!:(r:Reply)=>void;state.reply=()=>new Promise(r=>{finish=r;});const v=render(<QueryClientProvider client={qc}><Control {...props} value={1} name="retained"/></QueryClientProvider>);
 await waitFor(()=>expect(state.calls).toHaveLength(1));expect(v.getByRole('combobox').textContent).toContain('Loading saved selection');expect((v.container.querySelector('input[name="retained"]') as HTMLInputElement).value).toBe('1');await act(async()=>finish(ok([row()])));await waitFor(()=>expect(v.getByRole('combobox').textContent).toContain('Synthetic one'));
});
it.each(controls)('%s retry retirement aborts active/history with no late read or cache write',async(_n,_C,props,key,useRead)=>{
 const qc=cache();qc.setQueryData(key,[row()]);qc.setQueryData([...key,'selected',8],[row(8)]);let retry!:()=>Promise<unknown>;const finishes:(()=>void)[]=[];
 state.reply=c=>new Promise(resolve=>finishes.push(()=>resolve(ok(c.filters.some(([k])=>k==='id')?[row(8)]:[row()]))));
 function Field(){const r=useRead({...props,selectedId:8} as never);React.useLayoutEffect(()=>{retry=async()=>r.refetch();});return null;}
 const dispose=registerPrivateCache(qc),v=render(<QueryClientProvider client={qc}><Field/></QueryClientProvider>);let pending!:Promise<unknown>;act(()=>{pending=retry();});await waitFor(()=>expect(state.calls).toHaveLength(2));v.unmount();dispose();expect(state.calls.every(c=>c.signal?.aborted)).toBe(true);
 await act(async()=>{finishes.forEach(f=>f());await pending;});expect(state.calls).toHaveLength(2);expect(qc.getQueryCache().getAll()).toEqual([]);
});
it.each([['currency',queryKeys.currencies(false),fetchCurrencies,useCurrenciesQuery],['term',queryKeys.paymentTerms(false),fetchPaymentTerms,usePaymentTermsQuery],['tax',queryKeys.taxTypes(false),fetchTaxTypes,useTaxTypesQuery]] as const)('%s prefetch and mount share one cancellable key',async(_n,key,fetcher,useRead)=>{
 const qc=cache();let finish!:(v:Reply)=>void;state.reply=()=>new Promise(r=>{finish=r;});const pending=qc.prefetchQuery<unknown>({queryKey:key,queryFn:({signal})=>fetcher(false,signal)});
 function Field(){useRead();return null;}const dispose=registerPrivateCache(qc),v=render(<QueryClientProvider client={qc}><Field/></QueryClientProvider>);await waitFor(()=>expect(state.calls).toHaveLength(1));v.unmount();dispose();expect(state.calls[0].signal?.aborted).toBe(true);await act(async()=>{finish(ok([row()]));await pending;});expect(qc.getQueryData(key)).toBeUndefined();
});
it('a real F04 session preserves the uncertain original currency tuple across choice refresh',async()=>{
 const qc=cache(),save=vi.fn();function Form(){const [value,setValue]=React.useState<number|null>(1),session=useWorkspaceSaveSession('synthetic-reference',20,7);return <><CurrencySelect value={value} name="currency" onValueChange={setValue}/><button onClick={()=>{const payload={currency_id:value};save(payload,session.begin(payload));}}>Retry same save</button></>;}
 const v=render(<QueryClientProvider client={qc}><Form/></QueryClientProvider>);await waitFor(()=>expect(v.getByRole('combobox').textContent).toContain('Synthetic one'));fireEvent.click(v.getByRole('button',{name:'Retry same save'}));const original=save.mock.calls[0];state.reply=async()=>fail();await act(async()=>{await qc.invalidateQueries({queryKey:queryKeys.currencies(false)});});fireEvent.click(v.getByRole('button',{name:'Retry same save'}));expect(save.mock.calls[1]).toEqual(original);expect(original[1]).toMatchObject({revision:'7'});
});
