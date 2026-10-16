import type {ReportBrandingProfile,ReportTemplate} from './types';

/** Presentation hints only. Server actions and database policies reauthorize every operation. */
export type TemplateCapabilities={manage:boolean;approve:boolean;publish:boolean;sign:boolean};
export const noTemplateCapabilities:TemplateCapabilities={manage:false,approve:false,publish:false,sign:false};
export function templateCapabilities(
 template:Pick<ReportTemplate,'branding_profile_id'>,
 profiles:ReportBrandingProfile[],
 global:TemplateCapabilities=noTemplateCapabilities,
):TemplateCapabilities{
 if(template.branding_profile_id===null)return global;
 const profile=profiles.find(p=>p.id===template.branding_profile_id);
 // Missing metadata is not an unowned/global template. Never borrow capability
 // from a different company or from the page's aggregate permission flags.
 if(!profile||profile.deleted_at)return noTemplateCapabilities;
 return {manage:profile.can_manage===true,approve:profile.can_approve===true,
  publish:profile.can_publish===true||profile.can_approve===true,sign:profile.can_sign===true};
}
