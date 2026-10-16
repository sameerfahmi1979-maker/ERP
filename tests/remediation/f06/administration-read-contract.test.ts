// Offline Auth/Data API doubles verify truthful read outcomes and private errors.
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({auth:vi.fn(),permission:vi.fn(),client:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn(),one:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:mock.auth,hasPermission:mock.permission}));
vi.mock('@/lib/supabase/server',()=>({createClient:mock.client}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/report-center/company-onboarding',()=>({ensureReportBrandingForOwnerCompany:vi.fn(),syncReportBrandingProfileFromOrganization:vi.fn()}));
import {getBranchById} from '@/server/actions/branches';
import {getOrganizationById} from '@/server/actions/organizations';
beforeEach(()=>{
 vi.resetAllMocks();mock.auth.mockResolvedValue({profile:{id:71}});mock.permission.mockReturnValue(true);
 mock.client.mockResolvedValue({from:mock.from});mock.from.mockReturnValue({select:mock.select});mock.select.mockReturnValue({eq:mock.eq});mock.eq.mockReturnValue({maybeSingle:mock.one});mock.one.mockResolvedValue({data:{id:17,workspace_revision:4},error:null});
});
describe.each([['branch',getBranchById,'branches','branches.view'],['organization',getOrganizationById,'owner_companies','organizations.view']] as const)('%s read boundary',(_name,read,table,permission)=>{
 it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1,NaN])('rejects invalid ID %s before querying',async id=>{expect(await read(id)).toMatchObject({success:false,errorCode:'invalid'});expect(mock.auth).not.toHaveBeenCalled();expect(mock.client).not.toHaveBeenCalled();});
 it('denies before data access without current capability',async()=>{mock.permission.mockReturnValue(false);expect(await read(17)).toMatchObject({success:false,errorCode:'denied'});expect(mock.permission).toHaveBeenCalledWith({profile:{id:71}},permission);expect(mock.client).not.toHaveBeenCalled();});
 it('returns row identity and revision using caller-scoped reads',async()=>{expect(await read(17)).toEqual({success:true,data:{id:17,workspace_revision:4}});expect(mock.from).toHaveBeenCalledWith(table);expect(mock.eq).toHaveBeenCalledWith('id',17);});
 it('only a successful empty read is not-found',async()=>{mock.one.mockResolvedValue({data:null,error:null});expect(await read(17)).toMatchObject({success:false,errorCode:'not_found'});});
 it.each(['database','transport','auth'])('%s failure is unavailable, not a fabricated404 or private diagnostic',async boundary=>{
  const secret='PRIVATE_INTERNAL_RECORD_CONSTRAINT_PASSWORD';
  if(boundary==='database')mock.one.mockResolvedValue({data:null,error:{code:'PGRST116',message:secret}});
  if(boundary==='transport')mock.one.mockRejectedValue(Error(secret));
  if(boundary==='auth')mock.auth.mockRejectedValue(Error(secret));
  const result=await read(17);expect(result).toMatchObject({success:false,errorCode:'unavailable'});expect(JSON.stringify(result)).not.toContain(secret);
 });
 it('rejects wrong record identity instead of rendering another record',async()=>{mock.one.mockResolvedValue({data:{id:18},error:null});expect(await read(17)).toMatchObject({success:false,errorCode:'unavailable'});});
});
