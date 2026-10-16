// @vitest-environment jsdom
import '../f05/setup';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import type {ReactNode} from 'react';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import type {ReportBrandingProfile,ReportTemplate} from '@/lib/report-center/types';
import {ReportTemplatesPageClient} from '@/features/report-center/report-templates-page-client';
import {GovernanceDashboardClient} from '@/app/(protected)/admin/reports/templates/governance/governance-dashboard-client';
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock('@/server/actions/organizations',()=>({backfillAllOrgBrandingProfiles:vi.fn()}));
vi.mock('@/server/actions/reports/templates',()=>({listBrandingProfiles:vi.fn()}));
vi.mock('@/server/actions/reports/template-governance',()=>({approveTemplate:vi.fn(),publishTemplate:vi.fn(),rejectTemplate:vi.fn(),runTemplateSecurityReviewAction:vi.fn()}));
vi.mock('@/features/report-center/template-form',()=>({TemplateForm:()=>null}));
vi.mock('@/features/report-center/branding-profile-form',()=>({BrandingProfileForm:()=>null}));
vi.mock('@/features/report-center/template-governance-actions',()=>({GovernanceStatusBadge:()=>null,SecurityReviewBadge:()=>null,GovernanceActionsDropdown:(p:{template:ReportTemplate;canManage:boolean;canApprove:boolean;canPublish:boolean})=><span data-testid={'governance-'+p.template.id}>{JSON.stringify({manage:p.canManage,approve:p.canApprove,publish:p.canPublish})}</span>}));
vi.mock('@/components/ui/tabs',()=>({Tabs:(p:{children:ReactNode})=><div>{p.children}</div>,TabsContent:(p:{children:ReactNode})=><div>{p.children}</div>,TabsList:()=>null,TabsTrigger:()=>null}));
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:({columns,data}:{columns:{id?:string;cell?:(p:{row:{original:ReportTemplate}})=>ReactNode}[];data:ReportTemplate[]})=><div>{data.map(row=><section key={row.id} aria-label={row.template_name}>{columns.filter(c=>['actions','is_active'].includes(c.id??'')).map(c=><div key={c.id}>{c.cell?.({row:{original:row}})}</div>)}</section>)}</div>}));
afterEach(cleanup);
const profiles=[{id:1,profile_name:'Company A',owner_company_id:1,can_manage:true,can_approve:false,is_active:true},{id:2,profile_name:'Company B',owner_company_id:2,can_manage:false,can_approve:true,is_active:true}] as ReportBrandingProfile[];
const rows=[{id:11,template_name:'A draft',branding_profile_id:1,governance_status:'draft',is_active:false},{id:12,template_name:'B draft',branding_profile_id:2,governance_status:'draft',is_active:true},{id:13,template_name:'A approved',branding_profile_id:1,governance_status:'approved',is_active:true},{id:14,template_name:'Missing profile',branding_profile_id:99,governance_status:'draft',is_active:false}] as ReportTemplate[];
const wrap=(child:ReactNode)=><FluentProvider theme={webLightTheme}>{child}</FluentProvider>;
it('visible edit and governance actions use each row company, not aggregate page permissions',()=>{
 render(wrap(<ReportTemplatesPageClient initialProfiles={profiles} initialTemplates={rows} canManage canUpload canApprove canPublish/>));
 expect(screen.getByRole('button',{name:'Edit template A draft'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Edit template B draft'})).toBeNull();expect(screen.queryByRole('button',{name:'Edit template Missing profile'})).toBeNull();
 expect(JSON.parse(screen.getByTestId('governance-11').textContent!)).toEqual({manage:true,approve:false,publish:false});expect(JSON.parse(screen.getByTestId('governance-12').textContent!)).toEqual({manage:false,approve:true,publish:true});
 expect((screen.getByRole('button',{name:'Edit template A approved'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
});
it('the governance queue only offers approval for its actually authorized company',()=>{
 render(wrap(<GovernanceDashboardClient counts={{in_review:2}} inReviewTemplates={[{...rows[0],governance_status:'in_review'},{...rows[1],governance_status:'in_review'}]} failedSecurityReviewTemplates={[]} canApprove canPublish canManage profiles={profiles}/>));
 expect(screen.getAllByRole('button',{name:'Approve',exact:true})).toHaveLength(1);expect(screen.getAllByRole('button',{name:'Reject',exact:true})).toHaveLength(1);
});
it('missing scope metadata disables governance even when the page aggregate flags are true',()=>{
 render(wrap(<GovernanceDashboardClient counts={{in_review:1}} inReviewTemplates={[{id:77,template_name:'Unknown ownership',governance_status:'in_review'}]} failedSecurityReviewTemplates={[]} canApprove canPublish canManage profiles={profiles}/>));expect(screen.queryByRole('button',{name:'Approve',exact:true})).toBeNull();
});
it.each([false,undefined])('inactive or unknown activity (%s) cannot offer actionable approval',active=>{
 render(wrap(<GovernanceDashboardClient counts={{in_review:1}} inReviewTemplates={[{...rows[1],is_active:active,workspace_revision:'2',governance_status:'in_review'}]} failedSecurityReviewTemplates={[]} canApprove canPublish canManage profiles={profiles}/>));
 expect((screen.getByRole('button',{name:'Approve',exact:true}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Reject',exact:true}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByText(active===false?'Inactive — history retained; changes unavailable.':'Availability unavailable — reload before acting.')).toBeTruthy();
});
it('active authorized queue rows retain enabled approval with a loaded revision',()=>{
 render(wrap(<GovernanceDashboardClient counts={{in_review:1}} inReviewTemplates={[{...rows[1],workspace_revision:'2',governance_status:'in_review'}]} failedSecurityReviewTemplates={[]} canApprove canPublish canManage profiles={profiles}/>));
 expect((screen.getByRole('button',{name:'Approve',exact:true}) as HTMLButtonElement).disabled).toBe(false);
});
