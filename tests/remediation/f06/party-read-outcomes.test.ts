import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import {getColumnValue} from '@/lib/export/format-export-data';
const m=vi.hoisted(()=>({ctx:{} as AuthContext,from:vi.fn(),labels:vi.fn(),responses:[] as unknown[]}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>m.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:m.from})}));
vi.mock('@/server/party-reference-labels',()=>({attachPartyReferenceLabels:m.labels}));
import {getParties,getPartiesByTypeCode,getPartyById,getPartyCataloguePage,getPartyCatalogueExport} from '@/server/actions/master-data/parties';
const privateError={message:'private database host or SQL detail',code:'XX000'};
beforeEach(()=>{
 vi.clearAllMocks();const codes=['master_data.parties.view'];m.ctx={profile:{id:1},isAccountActive:true,roleCodes:[],permissionCodes:codes,globalPermissionCodes:codes,roleAssignments:[{roleCode:'test',ownerCompanyId:null,branchId:null,permissionCodes:codes}]} as unknown as AuthContext;
 m.responses=[];m.from.mockImplementation(()=>{const result=m.responses.shift();const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,range:()=>q,single:()=>Promise.resolve(result),maybeSingle:()=>Promise.resolve(result),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};return q;});
 m.labels.mockImplementation(async(_entity,rows)=>rows);
});
it.each(['all','filtered','detail'])('%s database failures are safe and explicit',async kind=>{
 m.responses=kind==='filtered'?[{data:{id:8},error:null},{data:null,count:null,error:privateError}]:[{data:null,error:privateError}];
 const r=kind==='all'?await getParties():kind==='detail'?await getPartyById(1):await getPartiesByTypeCode('CUSTOMER');
 expect(r).toMatchObject({success:false,kind:'failed'});expect(JSON.stringify(r)).not.toContain(privateError.message);
});
it.each(['type','matched Party list'])('filtered %s query failure is not an empty success',async step=>{
 m.responses=step==='type'?[{data:null,error:privateError}]:[{data:{id:8},error:null},{data:null,error:privateError}];
 expect(await getPartiesByTypeCode('CUSTOMER')).toMatchObject({success:false,kind:'failed'});
});
it('unconfigured party type is not advertised as zero matching business records',async()=>{
 m.responses=[{data:null,error:null}];expect(await getPartiesByTypeCode('CUSTOMER')).toMatchObject({success:false,kind:'not_found'});
});
it('a configured type with zero assignments is a true empty success',async()=>{
 m.responses=[{data:{id:8},error:null},{data:[],count:0,error:null}];expect(await getPartiesByTypeCode('CUSTOMER')).toEqual({success:true,data:[]});
 expect(m.from.mock.calls.map(([table])=>table)).toEqual(['party_types','parties']);
});
it('a missing permitted detail has a distinct not-found result',async()=>{
 m.responses=[{data:null,error:null}];expect(await getPartyById(1)).toMatchObject({success:false,kind:'not_found'});
});
it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1])('rejects invalid detail identity %s before any query',async id=>{
 expect(await getPartyById(id)).toMatchObject({success:false,kind:'not_found'});expect(m.from).not.toHaveBeenCalled();
});
it('company-scoped view is not global party authority',async()=>{
 m.ctx={...m.ctx,globalPermissionCodes:[],roleAssignments:[{roleCode:'test',ownerCompanyId:1,branchId:null,permissionCodes:['master_data.parties.view']}]};
 for(const read of [()=>getParties(),()=>getPartyById(1),()=>getPartiesByTypeCode('CUSTOMER')])expect(await read()).toMatchObject({success:false,kind:'forbidden'});
 expect(m.from).not.toHaveBeenCalled();
});
it('reference-label failure remains a failure without exposing its details',async()=>{
 m.responses=[{data:[{id:1}],count:1,error:null}];m.labels.mockRejectedValue(new Error(privateError.message));
 const r=await getParties();expect(r).toMatchObject({success:false,kind:'failed'});expect(m.labels).toHaveBeenCalledOnce();expect(JSON.stringify(r)).not.toContain(privateError.message);
});
it('legacy global read permission remains supported',async()=>{
 const codes=['master_data.party_master.view'];m.ctx={...m.ctx,permissionCodes:codes,globalPermissionCodes:codes,roleAssignments:[{roleCode:'test',ownerCompanyId:null,branchId:null,permissionCodes:codes}]};
 m.responses=[{data:[],count:0,error:null}];expect(await getParties()).toEqual({success:true,data:[]});
});

function cataloguePort() {
 const ranges: number[][] = [];
 const predicates: Array<[string, unknown]> = [];
 const projections: string[] = [];
 m.from.mockImplementation(() => {
  const response = m.responses.shift();
  const query = {
   select: (projection: string) => { projections.push(projection); return query; },
   eq: (key: string, value: unknown) => { predicates.push([key, value]); return query; },
   order: () => query,
   range: (from: number, to: number) => { ranges.push([from, to]); return query; },
   maybeSingle: async () => response,
   then: (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve),
  };
  return query;
 });
 return { ranges, predicates, projections };
}

it.each([[0, 25], [11, 100]] as const)('counts a typed list of 1,250 without collecting the catalogue, page index %s, size %s', async (pageIndex, pageSize) => {
 const { ranges, predicates, projections } = cataloguePort();
 const start = pageIndex * pageSize;
 const data = Array.from({ length: pageSize }, (_, index) => ({ id: start + index + 1, party_code: `PRT${start + index + 1}` }));
 m.responses = [{ data: { id: 8 }, error: null }, { data, count: 1250, error: null }];
 m.labels.mockImplementation(async (_entity, rows) => rows.map((row: { id: number }) => ({ ...row, country_name: 'Historical country' })));
 const result = await getPartyCataloguePage({ typeCode: 'CUSTOMER', pageIndex, pageSize });
 expect(result.data?.totalCount).toBe(1250);
 expect(result.data?.rows.map(row => row.id)).toEqual(data.map(row => row.id));
 expect(result.data?.rows.at(-1)?.country_name).toBe('Historical country');
 expect(ranges).toEqual([[start, start + pageSize - 1]]);
 expect(predicates).toEqual([['type_code', 'CUSTOMER'], ['type_scope.party_type_id', 8], ['type_scope.is_active', true]]);
 expect(projections[1]).toContain('type_scope:party_type_assignments!inner()');
 expect(projections[1]).not.toContain('*');
 expect(m.labels).toHaveBeenCalledOnce();
});

it('uses one bounded recount to report a moved terminal page with the true total', async () => {
 const { ranges } = cataloguePort();
 m.responses = [
  { data: null, count: null, error: { code: 'PGRST103' }, status: 416 },
  { data: [{ id: 1 }], count: 1250, error: null },
 ];
 expect(await getPartyCataloguePage({ pageIndex: 50, pageSize: 25 })).toMatchObject({ success: true, data: { rows: [], totalCount: 1250 } });
 expect(ranges).toEqual([[1250, 1274], [0, 0]]);
 expect(m.labels).not.toHaveBeenCalled();
});

it('fails closed for a short counted page or a missing historical label', async () => {
 cataloguePort();
 m.responses = [{ data: [{ id: 1 }], count: 1250, error: null }, { data: [{ id: 1 }], count: 1, error: null }];
 expect(await getPartyCataloguePage({})).toMatchObject({ success: false, kind: 'failed' });
 expect(m.labels).not.toHaveBeenCalled();
 m.labels.mockRejectedValueOnce(new Error(privateError.message));
 const result = await getPartyCataloguePage({});
 expect(result).toMatchObject({ success: false, kind: 'failed' });
 expect(JSON.stringify(result)).not.toContain(privateError.message);
});

it('direct paged reads enforce global authority and bounded input', async () => {
 expect(await getPartyCataloguePage({ pageSize: 1000 })).toMatchObject({ success: false, kind: 'failed' });
 expect(m.from).not.toHaveBeenCalled();
 m.ctx = { ...m.ctx, globalPermissionCodes: [], roleAssignments: [{ roleCode: 'test', ownerCompanyId: 1, branchId: 1, permissionCodes: ['master_data.parties.view'] }] };
 expect(await getPartyCataloguePage({ typeCode: 'VENDOR' })).toMatchObject({ success: false, kind: 'forbidden' });
 expect(m.from).not.toHaveBeenCalled();
});

it('finds a hydrated historical label past the API default cap, and keeps a literal wildcard', async () => {
 const { ranges } = cataloguePort();
 const rows = Array.from({ length: 1250 }, (_, index) => ({ id: index+1, display_name: `Party ${index+1}`, country_name: 'Common' }));
 m.responses = [0, 500, 1000].map(from => ({ data: rows.slice(from, from+500), count: 1250, error: null }));
 m.labels.mockImplementation(async (_entity, data) => data.map((row: { id: number }) => ({
  ...row, country_name: row.id === 1201 ? 'Hidden Market_%' : row.id === 1202 ? 'Hidden Market Other' : 'Common',
 })));
 const result = await getPartyCataloguePage({ search: 'HiDdEn MARKET_%' });
 expect(result.data?.totalCount).toBe(1);
 expect(result.data?.rows.map(row => row.id)).toEqual([1201]);
 expect(ranges).toEqual([[0, 499], [500, 999], [1000, 1499]]);
});

it('retains current global search eligibility for a null first-row email and its explicit text filter', async () => {
 cataloguePort();
 const rows = [{ id: 1, party_code: 'PRT1', main_email: null }, { id: 2, party_code: 'PRT2', main_email: 'late@example.invalid' }];
 m.responses = Array.from({ length: 2 }, () => ({ data: rows, count: rows.length, error: null }));
 expect((await getPartyCataloguePage({ search: 'late@example.invalid' })).data?.rows).toEqual([]);
 expect((await getPartyCataloguePage({ filters: [{ id: 'main_email', value: 'LATE@example.invalid' }] })).data?.rows.map(row => row.id)).toEqual([2]);
});

it('sorts hydrated labels naturally across all matching rows and preserves the original tie order', async () => {
 cataloguePort();
 const rows = Array.from({ length: 27 }, (_, index) => ({ id: index+1 }));
 m.responses = [{ data: rows, count: rows.length, error: null }];
 m.labels.mockImplementation(async (_entity, data) => data.map((row: { id: number }) => ({
  ...row, emirate_name: row.id < 4 ? null : row.id === 26 || row.id === 27 ? 'Area 2' : 'Area 10',
 })));
 const result = await getPartyCataloguePage({ sorting: [{ id: 'emirate_name', desc: false }] });
 expect(result.data?.totalCount).toBe(27);
 expect(result.data?.rows.slice(0, 6).map(row => row.id)).toEqual([1, 2, 3, 26, 27, 4]);
});

it('exports every matching row, or an exact selected subset in current sort order', async () => {
 const { predicates } = cataloguePort();
 const rows = Array.from({ length: 1100 }, (_, index) => ({ id: index+1, display_name: `Party ${index+1}` }));
 function typed() { return [{ data: { id: 8 }, error: null }, ...[0, 500, 1000].map(from => ({ data: rows.slice(from, from+500), count: 1100, error: null }))]; }
 m.responses = [...typed(), ...typed(), ...typed()];
 const input = { typeCode: 'CUSTOMER', search: 'Party ', sorting: [{ id: 'display_name', desc: true }] };
 const all = await getPartyCatalogueExport(input);
 expect(all.data?.length).toBe(1100);
 expect(all.data?.slice(0, 3).map(row => row.id)).toEqual([1100, 1099, 1098]);
 const selected = await getPartyCatalogueExport({ ...input, selectedIds: [2, 1100, 103] });
 expect(selected.data?.map(row => row.id)).toEqual([1100, 103, 2]);
 expect(await getPartyCatalogueExport({ ...input, selectedIds: [2, 1101] })).toMatchObject({ success: false });
 expect(predicates.filter(([key]) => key === 'type_scope.is_active').length).toBe(9);
});

it('retains the existing Party Types attachment cell and its empty value', async () => {
 cataloguePort();
 const rows = [{ id: 1, party_types: { type_name: 'Customer' } }, { id: 2, party_types: null }];
 m.responses = [{ data: rows, count: 2, error: null }, { data: rows, count: 2, error: null }];
 const legacy = await getParties();
 const pagedExport = await getPartyCatalogueExport({});
 type RuntimeExportValue = { party_types?: unknown };
 const column = { key: 'party_types' as const, header: 'Party Types' };
 expect((legacy.data as unknown as RuntimeExportValue[]).map(row => getColumnValue(row,column))).toEqual(['{"type_name":"Customer"}', '']);
 expect(pagedExport.data?.map(row => getColumnValue(row,column))).toEqual(['{"type_name":"Customer"}', '']);
});
