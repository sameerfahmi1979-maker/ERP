// Real export/asset resolvers over controlled DB/storage/principal transports.
// These cases do not stand in for issued-file byte or browser acceptance.
import {beforeEach,expect,it,vi} from 'vitest';
import sharp from 'sharp';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({principal:vi.fn(),sign:vi.fn(),info:vi.fn(),download:vi.fn(),profile:{} as Record<string,unknown>,template:{} as Record<string,unknown>,assets:[] as Record<string,unknown>[],changeDuringAssets:false}));
vi.mock('@/lib/rbac/check',async()=>({...await vi.importActual('@/lib/rbac/scope'),getAuthContextForProfileId:m.principal}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({
  storage:{from:()=>({createSignedUrl:m.sign,info:m.info,download:m.download})},
  from:(table:string)=>{
    const result=()=>{
      if(table==='erp_report_templates')return {data:{...m.template,branding_profile:{...m.profile}},error:null};
      if(table==='erp_report_branding_profiles')return {data:{...m.profile},error:null};
      if(m.changeDuringAssets)m.profile.workspace_revision=4;
      return {data:m.assets.map(a=>({...a})),error:null};
    };
    const q={select:()=>q,eq:()=>q,is:()=>q,single:async()=>result(),maybeSingle:async()=>result(),then:(fn:(r:unknown)=>unknown)=>Promise.resolve(result()).then(fn)};return q;
  },
})}));
import {resolveTemplateForExport} from '@/lib/report-center/template-export';
import {issuedBrandingSnapshot,requireBrandingRevision} from '@/lib/branding/issuance-provenance';
const resolve=()=>resolveTemplateForExport({templateId:7,principalId:11,...{forIssuance:true}});
const asset=(id:number,type:string,version:number)=>({id,workspace_revision:1,asset_scope:'report',app_settings_id:null,branding_profile_id:4,owner_company_id:1,asset_type:type,version_no:version,storage_bucket:'erp-branding-assets',storage_path:`report/company-1/profile-4/${type}/v${version}.png`,mime_type:'image/png',is_active:true,deleted_at:null});
beforeEach(async()=>{
  vi.clearAllMocks();m.changeDuringAssets=false;
  m.profile={id:4,workspace_revision:3,owner_company_id:1,is_active:true,legal_name_en:'F06 synthetic issuer',deleted_at:null};
  m.template={id:7,workspace_revision:5,version_no:2,branding_profile_id:4,template_name:'F06 synthetic letter',is_active:true,governance_status:'approved',show_logo:true,show_small_logo:false,show_stamp:true,show_signatory:true,show_watermark:false};
  m.assets=[asset(10,'report_logo',2),asset(12,'signature',3),asset(13,'watermark',1)];
  m.sign.mockResolvedValue({data:{signedUrl:'https://synthetic.invalid/private-asset?token=TEST_CAPABILITY'},error:null});
  const png=await sharp({create:{width:2,height:2,channels:4,background:'blue'}}).png().toBuffer();
  m.info.mockResolvedValue({error:null,data:{id:'synthetic-raster',version:'v1',lastModified:'2026-10-18T00:00:00.000Z',size:png.length}});
  m.download.mockResolvedValue({error:null,data:new Blob([png])});
  m.principal.mockResolvedValue({isAccountActive:true,profile:{id:11,must_change_password:false},roleCodes:['synthetic'],permissionCodes:['reports.view'],globalPermissionCodes:[],roleAssignments:[{roleCode:'synthetic',ownerCompanyId:1,branchId:null,permissionCodes:['reports.view']}]} as unknown as AuthContext);
});
it('captures exact template/profile and rendered-asset versions, without signed capabilities',async()=>{
  const result=await resolve();expect(result?.companyNameEn).toBe('F06 synthetic issuer');
  expect(result?.logoUrl).toMatch(/^data:image\/png;base64,iVBOR/);expect(m.sign).not.toHaveBeenCalled();
  const provenance=(result as unknown as {provenance:unknown})?.provenance;
  expect(provenance).toEqual({schemaVersion:1,templateId:7,templateRevision:'5',templateVersion:2,brandingProfileId:4,brandingRevision:'3',ownerCompanyId:1,assets:[{id:10,type:'report_logo',version:2,revision:'1'}]});
  expect(JSON.stringify(provenance)).not.toMatch(/token|https:|storage_path|signature|watermark/);
});
it('includes sensitive asset versions only with separate same-company signing authority',async()=>{
  const principal=await m.principal();principal.permissionCodes.push('reports.sign');principal.roleAssignments[0].permissionCodes.push('reports.sign');
  const result=await resolve();expect((result as unknown as {provenance:{assets:unknown[]}})?.provenance?.assets).toEqual([{id:10,type:'report_logo',version:2,revision:'1'},{id:12,type:'signature',version:3,revision:'1'}]);
});
it('rejects a mixed old-profile/new-assets snapshot when branding changes while reading',async()=>{m.changeDuringAssets=true;expect(await resolve()).toBeNull();});
it.each(['template','profile'])('does not invent a missing %s revision',async entity=>{delete (entity==='template'?m.template:m.profile).workspace_revision;expect(await resolve()).toBeNull();});
it('does not issue with an unversioned asset identity',async()=>{delete m.assets[0].workspace_revision;expect(await resolve()).toBeNull();});
it('requires the selected template to remain active',async()=>{m.template.is_active=false;expect(await resolve()).toBeNull();});
it('does not create an issuer identity from an absent branding profile',async()=>{m.profile={};m.template.branding_profile_id=null;expect(await resolve()).toBeNull();});
it('keeps ordinary legacy export resolution available without requiring issuance provenance',async()=>{delete m.template.workspace_revision;const result=await resolveTemplateForExport({templateId:7,principalId:11});expect(result?.companyNameEn).toBe('F06 synthetic issuer');});
it('retains the current same-company authorization boundary',async()=>{m.profile.owner_company_id=2;expect(await resolve()).toBeNull();expect(m.sign).not.toHaveBeenCalled();});
it('fails closed when report authority is withdrawn during resource download',async()=>{const original=await m.download();m.download.mockImplementation(async()=>{const p=await m.principal();p.roleAssignments=[];return original;});expect(await resolve()).toBeNull();});
it('does not fabricate provenance for a configured mutable legacy logo',async()=>{m.profile.logo_url='https://synthetic.invalid/legacy-logo.png';m.assets=[];expect(await resolve()).toBeNull();});
it('stores an independent allowlisted snapshot without display URLs',async()=>{
  const branding=await resolve();expect(branding).not.toBeNull();const snapshot=issuedBrandingSnapshot(branding!);
  expect(snapshot).toMatchObject({templateRevision:'5',brandingRevision:'3',companyNameEn:'F06 synthetic issuer'});
  expect(JSON.stringify(snapshot)).not.toMatch(/https:|TEST_CAPABILITY|storage_path/);
  branding!.provenance!.assets[0].version=99;expect(snapshot!.assets[0].version).toBe(2);
});
it.each([undefined,null,0,-1,1.5,'0','01','-1','1.5','9223372036854775808',Number.MAX_SAFE_INTEGER+1])('does not normalize invalid version identity %s into an invented version',value=>{expect(()=>requireBrandingRevision(value)).toThrow();});
it('preserves a large exact database revision as text',()=>{expect(requireBrandingRevision('9223372036854775807')).toBe('9223372036854775807');});
