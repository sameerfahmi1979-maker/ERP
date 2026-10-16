import {expect,it} from 'vitest';
import {templateCapabilities,noTemplateCapabilities} from '@/lib/report-center/template-capabilities';
import type {ReportBrandingProfile} from '@/lib/report-center/types';
const profiles=[{id:1,owner_company_id:1,can_manage:true,can_sign:false,can_approve:false},{id:2,owner_company_id:2,can_manage:false,can_sign:true,can_approve:true}] as ReportBrandingProfile[];
it('combined roles do not transfer signing or approval to the managed company',()=>{expect(templateCapabilities({branding_profile_id:1},profiles)).toEqual({manage:true,sign:false,approve:false,publish:false});});
it('approval and signing in company two do not invent its management permission',()=>{expect(templateCapabilities({branding_profile_id:2},profiles)).toEqual({manage:false,sign:true,approve:true,publish:true});});
it('a no-profile template requires explicitly global capabilities',()=>{expect(templateCapabilities({branding_profile_id:null},profiles)).toEqual(noTemplateCapabilities);expect(templateCapabilities({branding_profile_id:null},profiles,{manage:true,sign:false,approve:false,publish:false}).manage).toBe(true);});
it('missing or deleted profile metadata fails closed, even with unrelated global hints',()=>{const global={manage:true,sign:true,approve:true,publish:true};expect(templateCapabilities({branding_profile_id:99},profiles,global)).toEqual(noTemplateCapabilities);expect(templateCapabilities({branding_profile_id:1},[{...profiles[0],deleted_at:'2026-01-01'}],global)).toEqual(noTemplateCapabilities);});
