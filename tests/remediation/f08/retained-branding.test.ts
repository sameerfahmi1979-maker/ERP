import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { AuthContext } from '@/lib/rbac/check';
const m=vi.hoisted(()=>({from:vi.fn(),info:vi.fn(),download:vi.fn(),sign:vi.fn(),version:'v1',revision:'1',mime:'image/png',bad:false,size:0}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:m.from,storage:{from:()=>({info:m.info,download:m.download,createSignedUrl:m.sign})}})}));
import { resolveReportBrandingProfileAssets } from '@/lib/branding/resolve-report-branding-assets';
const actor=(sign=false)=>({isAccountActive:true,profile:{id:1,must_change_password:false},roleCodes:[],permissionCodes:['reports.view',...(sign?['reports.sign']:[])],globalPermissionCodes:[],roleAssignments:[{roleCode:'synthetic',ownerCompanyId:1,branchId:null,permissionCodes:['reports.view',...(sign?['reports.sign']:[])]}]}) as unknown as AuthContext;
beforeEach(async()=>{
 vi.resetAllMocks();m.version='v1';m.revision='1';m.mime='image/png';m.bad=false;
 const png=await sharp({create:{width:3,height:2,channels:4,background:'blue'}}).png().toBuffer();m.size=png.length;
 m.info.mockImplementation(async()=>({error:null,data:{id:'synthetic-object',version:m.version,lastModified:'2026-10-18T00:00:00.000Z',size:m.size}}));
 m.download.mockImplementation(async()=>({error:null,data:new Blob([m.bad?Buffer.from('<svg><script>bad()</script></svg>'):png])}));
 m.from.mockImplementation((table:string)=>{
  const result=()=>({error:null,data:table==='erp_report_branding_profiles'?{id:4,owner_company_id:1,is_active:true,workspace_revision:m.revision}:[{id:1,asset_scope:'report',owner_company_id:1,branding_profile_id:4,app_settings_id:null,asset_type:'report_logo',storage_bucket:'erp-branding-assets',storage_path:'report/company-1/profile-4/report_logo/v1.png',mime_type:m.mime,version_no:1,workspace_revision:'1',is_active:true,deleted_at:null}]});
  const b={select:()=>b,eq:()=>b,is:()=>b,maybeSingle:async()=>result(),then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};return b;
 });
});
it('retains actual decoded raster bytes rather than a temporary signed URL',async()=>{
 const result=await resolveReportBrandingProfileAssets(4,actor(),'1',['report_logo']);expect(result.urls.report_logo).toMatch(/^data:image\/png;base64,iVBOR/);expect(result.assets).toHaveLength(1);expect(m.sign).not.toHaveBeenCalled();
});
it('a changing object version cannot become a retained resource',async()=>{
 m.download.mockImplementation(async()=>{m.version='v2';return {data:new Blob([Buffer.alloc(m.size)]),error:null};});
 await expect(resolveReportBrandingProfileAssets(4,actor(),'1',['report_logo'])).rejects.toThrow(/unavailable/);
});
it('oversized declared storage bytes are rejected before download',async()=>{
 m.size=11*1024*1024;await expect(resolveReportBrandingProfileAssets(4,actor(),'1',['report_logo'])).rejects.toThrow(/unavailable/);expect(m.download).not.toHaveBeenCalled();
});
it('unrecognized or active bytes are never embedded',async()=>{m.bad=true;await expect(resolveReportBrandingProfileAssets(4,actor(),'1',['report_logo'])).rejects.toThrow(/unavailable/);});
it('a replaced parent revision cannot silently supply a newer brand',async()=>{m.revision='2';await expect(resolveReportBrandingProfileAssets(4,actor(),'1',['report_logo'])).rejects.toThrow(/changed/);expect(m.download).not.toHaveBeenCalled();});
it('missing stable object identity fails closed before download',async()=>{
 m.info.mockResolvedValue({data:{size:m.size,id:null,version:null,lastModified:null},error:null});await expect(resolveReportBrandingProfileAssets(4,actor(),'1',['report_logo'])).rejects.toThrow(/unavailable/);expect(m.download).not.toHaveBeenCalled();
});
