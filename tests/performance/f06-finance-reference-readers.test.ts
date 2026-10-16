// Native Supabase serialization with an entirely synthetic fetch; no live request.
import {createClient} from '@supabase/supabase-js';
import {beforeEach,expect,it,vi} from 'vitest';
import {fetchConfigurationChoices,type ConfigurationResource} from '@/lib/lookups/configuration-fetchers';
import {fetchCurrencies,fetchPaymentTerms,fetchTaxTypes} from '@/lib/lookups/master-data-fetchers';
import {ORGANIZATION_FORM_PREFETCH} from '@/features/organizations/organization-prefetch';
import * as templates from '@/lib/standards/party-master-prefetch-templates';
import type {FormPrefetchDeclaration} from '@/lib/query/form-prefetch-types';
import {QueryClient} from '@tanstack/react-query';
import {prefetchPartyFormData} from '@/features/master-data/parties/party-form-prefetch';
import {registerPrivateCache} from '@/lib/query/private-cache';
const port=vi.hoisted(()=>({client:vi.fn()}));
vi.mock('@/lib/supabase/client',()=>({createClient:port.client}));
vi.mock('@/server/actions/master-data/parties',()=>Object.fromEntries(['getPartyNatures','getPartyStatuses','getPartyTypes','getPartyLicenseTypes','getPartyLicenseStatuses','getPartyTaxStatuses','getPartyContactRoles','getPartyContactDepartments','getPartyAddressTypes','getPartyDocumentTypes','getPartyDocumentStatuses','getPaymentMethods'].map(name=>[name,async()=>({success:true,data:[]})])));
vi.mock('@/server/actions/master-data/party-notes',()=>({getPartyNoteTypes:async()=>({success:true,data:[]})}));
vi.mock('@/server/actions/master-data/party-service-categories',()=>({getServiceCategoriesForSelect:async()=>({success:true,data:[]})}));
type Row={id:number;[key:string]:unknown};
type Mode='ok'|'error'|'denied'|'count'|'missing'|'duplicate'|'short';
let calls:{url:URL;signal:AbortSignal|null|undefined}[]=[],mode:Mode='ok';
let barrier:Promise<void>|null=null;
const rows:Row[]=Array.from({length:501},(_,i)=>({id:i+1,currency_code:`C${i+1}`,currency_name_en:'Currency',currency_name_ar:'عملة',symbol:'S',is_base_currency:false,bank_code:'B',bank_name_en:'Bank',bank_name_ar:'بنك',short_name:'Short',term_code:'T',term_name_en:'Term',term_name_ar:'فترة',due_days:0,tax_code:'X',tax_name_en:'Tax',tax_name_ar:'ضريبة',tax_rate:0}));
beforeEach(()=>{calls=[];mode='ok';barrier=null;port.client.mockReturnValue(createClient('http://127.0.0.1:1','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
 const url=new URL(String(input)),from=Number(url.searchParams.get('offset')??0),size=Number(url.searchParams.get('limit')??500);calls.push({url,signal:init?.signal});
 if(barrier && /\/(currencies|payment_terms|tax_types)$/.test(url.pathname))await barrier;
 if(from>0&&(mode==='error'||mode==='denied'))return new Response(JSON.stringify({message:'PRIVATE DETAIL'}),{status:mode==='error'?503:403});
 const found=url.searchParams.has('id')?rows.filter(r=>`eq.${r.id}`===url.searchParams.get('id')):rows;
 let data=found.slice(from,from+size);if(mode==='duplicate'&&from>0)data=data.map(r=>({...r,id:1}));if(mode==='short')data=data.slice(0,10);
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json',...(mode==='missing'?{}:{'Content-Range':`${from}-${from+data.length-1}/${found.length+(mode==='count'&&from>0?1:0)}`})}});
 }}}));});
const families=[['currencies','currencies','currency_name_en',fetchCurrencies],['banks','banks','bank_name_en',(inactive=false,signal?:AbortSignal)=>fetchConfigurationChoices<Row>('banks' as ConfigurationResource,{includeInactive:inactive,parentId:7},signal)],['paymentTerms','payment_terms','term_name_en',fetchPaymentTerms],['taxTypes','tax_types','tax_name_en',fetchTaxTypes]] as const;
it.each(families)('%s returns all501 rows, native filters/order and false/zero values',async(_resource,table,order,read)=>{
 const signal=new AbortController().signal,data=await read(false,signal);expect(data).toHaveLength(501);expect(data[500]).toMatchObject({id:501,is_base_currency:false,due_days:0,tax_rate:0});expect(calls).toHaveLength(2);
 for(const {url,signal:s} of calls){expect(url.pathname).toBe(`/rest/v1/${table}`);expect(url.searchParams.get('order')).toBe(`sort_order.asc,${order}.asc,id.asc`);expect(url.searchParams.get('is_active')).toBe('eq.true');expect(s).toBe(signal);if(table==='banks')expect(url.searchParams.get('country_id')).toBe('eq.7');}
});
it.each(families.flatMap(f=>['error','denied','count','missing','duplicate','short'].map(mode=>[f[0],f[3],mode] as const)))('%s refuses %s incomplete results',async(_name,read,failure)=>{mode=failure as Mode;let error:unknown;try{await read();}catch(e){error=e;}expect(error).toBeTruthy();expect(String(error)).not.toContain('PRIVATE');});
it.each(families)('%s exact historical choice omits activity only and retains scoped predicates',async(resource)=>{
 const data=await fetchConfigurationChoices<Row>(resource as ConfigurationResource,{selectedId:501,parentId:7});expect(data).toEqual([rows[500]]);expect(calls).toHaveLength(1);expect(calls[0].url.searchParams.get('is_active')).toBeNull();expect(calls[0].url.searchParams.get('id')).toBe('eq.501');if(resource==='banks')expect(calls[0].url.searchParams.get('country_id')).toBe('eq.7');
});
it.each(families)('%s explicit includeInactive remains a distinct full catalogue',async(_r,_t,_o,read)=>{expect(await read(true)).toHaveLength(501);expect(calls.every(c=>!c.url.searchParams.has('is_active'))).toBe(true);});
it.each(families)('%s honors already-aborted signals before dispatch',async(_r,_t,_o,read)=>{const controller=new AbortController();controller.abort();await expect(read(false,controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(calls).toEqual([]);});
it('every finance prefetch declaration forwards the exact signal',async()=>{
 const declarations:FormPrefetchDeclaration[]=[ORGANIZATION_FORM_PREFETCH,templates.VENDOR_FORM_PREFETCH_TEMPLATE,templates.SUBCONTRACTOR_FORM_PREFETCH_TEMPLATE,templates.CONSULTANT_FORM_PREFETCH_TEMPLATE,templates.GOVERNMENT_AUTHORITY_FORM_PREFETCH_TEMPLATE,templates.RECRUITMENT_AGENCY_FORM_PREFETCH_TEMPLATE];
 let tested=0;for(const d of declarations)for(const q of d.masterQueries){if(!['currencies','payment_terms','tax_types'].includes(String(q.queryKey[1])))continue;calls=[];const signal=new AbortController().signal;await q.queryFn(signal);expect(calls.length).toBe(2);expect(calls.every(c=>c.signal===signal)).toBe(true);tested++;}expect(tested).toBeGreaterThan(5);
});
it('active party finance prefetches abort together on retirement and never repopulate late rows',async()=>{
 let release!:()=>void;barrier=new Promise(resolve=>{release=resolve;});const qc=new QueryClient({defaultOptions:{queries:{retry:false}}}),dispose=registerPrivateCache(qc);
 try{const pending=prefetchPartyFormData(qc);await vi.waitFor(()=>expect(calls.filter(c=>/\/(currencies|payment_terms|tax_types)$/.test(c.url.pathname))).toHaveLength(3));const finance=calls.filter(c=>/\/(currencies|payment_terms|tax_types)$/.test(c.url.pathname));dispose();expect(finance.every(c=>c.signal?.aborted)).toBe(true);release();await pending;expect(qc.getQueryCache().getAll()).toEqual([]);expect(calls.filter(c=>/\/(currencies|payment_terms|tax_types)$/.test(c.url.pathname))).toHaveLength(3);}finally{release();dispose();qc.clear();}
});
