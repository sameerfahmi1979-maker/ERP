import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import type {BrandingAsset} from '@/lib/branding/types';
const m=vi.hoisted(()=>({admin:vi.fn(),sign:vi.fn(),profile:null as Record<string,unknown>|null,assets:[] as unknown[],profileError:null as unknown,assetError:null as unknown,bucket:vi.fn()}));
vi.mock('server-only',()=>({}));vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
import {resolveReportBrandingProfileAssetUrls} from '@/lib/branding/resolve-report-branding-assets';
const actor=(sign=false)=>({isAccountActive:true,profile:{id:1,must_change_password:false},roleCodes:['synthetic'],permissionCodes:['reports.view',...(sign?['reports.sign']:[])],globalPermissionCodes:[],roleAssignments:[{roleCode:'synthetic',ownerCompanyId:1,branchId:null,permissionCodes:['reports.view',...(sign?['reports.sign']:[])]}]}) as unknown as AuthContext;
const asset=(patch:Partial<BrandingAsset>={})=>({id:1,asset_scope:'report',owner_company_id:1,branding_profile_id:4,app_settings_id:null,asset_type:'report_logo',storage_bucket:'erp-branding-assets',storage_path:'report/company-1/profile-4/report_logo/v1.png',mime_type:'image/png',version_no:1,is_active:true,deleted_at:null,...patch}) as BrandingAsset;
beforeEach(()=>{
 vi.clearAllMocks();m.profile={id:4,owner_company_id:1,is_active:true};m.assets=[asset()];m.profileError=null;m.assetError=null;
 m.sign.mockResolvedValue({data:{signedUrl:'https://synthetic.invalid/signed-asset'},error:null});m.bucket.mockReturnValue({createSignedUrl:m.sign});
 m.admin.mockReturnValue({storage:{from:m.bucket},from:(table:string)=>{
  const result=()=>table==='erp_report_branding_profiles'?{data:m.profile,error:m.profileError}:{data:m.assets,error:m.assetError};
  const builder={select:()=>builder,eq:()=>builder,is:()=>builder,maybeSingle:async()=>result(),then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};return builder;
 }});
});
it('requires a trusted principal before opening a privileged client',async()=>{await expect(resolveReportBrandingProfileAssetUrls(4,null)).rejects.toThrow(/authority/i);expect(m.admin).not.toHaveBeenCalled();});
it('denies another company profile before reading or signing its assets',async()=>{m.profile!.owner_company_id=2;await expect(resolveReportBrandingProfileAssetUrls(4,actor())).rejects.toThrow(/authorized/i);expect(m.sign).not.toHaveBeenCalled();});
it('returns a permitted current logo without granting business-data access',async()=>{expect(await resolveReportBrandingProfileAssetUrls(4,actor())).toEqual({report_logo:'https://synthetic.invalid/signed-asset'});expect(m.bucket).toHaveBeenCalledWith('erp-branding-assets');expect(m.sign).toHaveBeenCalledWith('report/company-1/profile-4/report_logo/v1.png',3600);});
it('does not sign confidential stamps without a separate same-company grant',async()=>{m.assets=[asset({asset_type:'stamp',storage_path:'report/company-1/profile-4/stamp/v1.png'})];expect(await resolveReportBrandingProfileAssetUrls(4,actor())).toEqual({});expect(m.sign).not.toHaveBeenCalled();expect(await resolveReportBrandingProfileAssetUrls(4,actor(true))).toHaveProperty('stamp');});
it('only calls a successful empty query empty',async()=>{m.assets=[];expect(await resolveReportBrandingProfileAssetUrls(4,actor())).toEqual({});m.assetError={message:'PRIVATE'};await expect(resolveReportBrandingProfileAssetUrls(4,actor())).rejects.toThrow('Branding assets could not be loaded.');});
it('rejects profile failure or inactive profile safely',async()=>{m.profileError={message:'PRIVATE'};await expect(resolveReportBrandingProfileAssetUrls(4,actor())).rejects.toThrow('The selected branding profile is unavailable or not authorized.');m.profileError=null;m.profile!.is_active=false;await expect(resolveReportBrandingProfileAssetUrls(4,actor())).rejects.toThrow(/unavailable/);});
it.each([
 ['wrong owner',{owner_company_id:2}],['wrong profile',{branding_profile_id:5}],['wrong bucket',{storage_bucket:'private-employee-files'}],
 ['wrong path company',{storage_path:'report/company-2/profile-4/report_logo/v1.png'}],['wrong path profile',{storage_path:'report/company-1/profile-5/report_logo/v1.png'}],
 ['path traversal',{storage_path:'report/company-1/profile-4/report_logo/../../signature/v1.png'}],['version mismatch',{version_no:2}],
 ['wrong asset scope',{asset_scope:'app'}],['unsupported type',{asset_type:'app_logo'}],['unsupported mime',{mime_type:'text/html'}],
 ['inactive asset',{is_active:false}],['deleted asset',{deleted_at:'2026-10-03'}],
 ] as Array<[string,Partial<BrandingAsset>]>)('rejects %s before signing any asset',async(_label,patch)=>{m.assets=[asset(),asset({id:2,...patch})];await expect(resolveReportBrandingProfileAssetUrls(4,actor(true))).rejects.toThrow(/reconciliation|invalid/i);expect(m.sign).not.toHaveBeenCalled();});
it('does not silently pick one of duplicate active versions',async()=>{m.assets=[asset(),asset({id:2,version_no:2,storage_path:'report/company-1/profile-4/report_logo/v2.png'})];await expect(resolveReportBrandingProfileAssetUrls(4,actor())).rejects.toThrow(/reconciliation/i);expect(m.sign).not.toHaveBeenCalled();});
it('does not hide storage failure or echo exceptions',async()=>{m.sign.mockResolvedValue({error:{message:'PRIVATE'},data:null});await expect(resolveReportBrandingProfileAssetUrls(4,actor())).rejects.toThrow('A selected branding asset is unavailable.');m.sign.mockRejectedValue(Error('PRIVATE'));await expect(resolveReportBrandingProfileAssetUrls(4,actor())).rejects.toThrow('A selected branding asset is unavailable.');});
