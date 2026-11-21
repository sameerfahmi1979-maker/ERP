import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {syntheticAuthContext} from './fixtures/auth-context';
const state=vi.hoisted(()=>({auth:vi.fn(),read:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:state.auth}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw Error('REDIRECT:'+url);}}));
vi.mock('@/server/reads/notifications',()=>({readNotifications:state.read}));
vi.mock('@/server/reads/email-queue',()=>({readEmailQueue:state.read}));
vi.mock('@/server/reads/notification-deliveries',()=>({readNotificationDeliveries:state.read}));
vi.mock('@/server/reads/notification-templates',()=>({readNotificationTemplates:state.read}));
vi.mock('@/features/notifications/notifications-page-client',()=>({NotificationsPageClient:()=>null}));
vi.mock('@/features/notifications/admin/admin-notifications-page-client',()=>({AdminNotificationsPageClient:()=>null}));
vi.mock('@/features/notifications/admin/email-queue-page-client',()=>({EmailQueuePageClient:()=>null}));
vi.mock('@/features/notifications/admin/delivery-logs-page-client',()=>({DeliveryLogsPageClient:()=>null}));
vi.mock('@/features/notifications/admin/notification-templates-page-client',()=>({NotificationTemplatesPageClient:()=>null}));
vi.mock('@/server/actions/dms/notification-settings',()=>({getDmsNotificationSettings:state.read}));
vi.mock('@/server/actions/reports/templates',()=>({listBrandingProfiles:state.read,listReportTemplates:state.read}));
import Own from '@/app/(protected)/notifications/page';
import Admin from '@/app/(protected)/admin/notifications/page';
import Queue from '@/app/(protected)/admin/notifications/email-queue/page';
import Logs from '@/app/(protected)/admin/notifications/logs/page';
import Templates from '@/app/(protected)/admin/notifications/templates/page';
import DmsSettings from '@/app/(protected)/admin/dms/notification-settings/page';
import ReportTemplates from '@/app/(protected)/admin/reports/templates/page';
const pages=[['own',Own],['admin',Admin],['queue',Queue],['logs',Logs],['templates',Templates]] as const;
const ctx=syntheticAuthContext(['notifications.admin']);
function seededClient(result:React.ReactElement<{children:React.ReactNode}>){
 const child=React.Children.toArray(result.props.children).find(value=>React.isValidElement(value)&&Object.hasOwn(value.props as object,'initialIdentity'));
 expect(child).toBeTruthy();return child as React.ReactElement<Record<string,unknown>>;
}
afterEach(()=>{state.auth.mockReset();state.read.mockReset();});
for(const [name,Page]of pages){
 it(name+' seeds the verified reader timestamp rather than a new render timestamp',async()=>{
  const data={page:1,pageSize:25,totalCount:0,rows:[]};state.auth.mockResolvedValue(ctx);state.read.mockResolvedValue({success:true,data,updatedAt:123});
  const result=await Page();expect(result).not.toBeNull();const child=seededClient(result!);
  expect(child.props).toMatchObject({authContext:ctx,initialPage:data,initialUpdatedAt:123});expect(typeof child.props.initialIdentity).toBe('string');
  expect(state.auth).toHaveBeenCalledTimes(1);expect(state.read).toHaveBeenCalledWith(name==='admin'?{audience:'admin'}:{},ctx);
 });
 it(name+' keeps a failed SSR seed unknown for the authenticated client retry',async()=>{
  state.auth.mockResolvedValue(ctx);state.read.mockResolvedValue({success:false,error:'unavailable'});
  const result=await Page(),child=seededClient(result!);
  expect(child.props.initialPage).toBeUndefined();expect(child.props.initialUpdatedAt).toBeUndefined();
 });
 it(name+' stops before the read for an inactive principal',async()=>{
  state.auth.mockResolvedValue({...ctx,isAccountActive:false,accountStatus:'suspended'});
  if(name==='own')expect(await Page()).toBeNull();else await expect(Page()).rejects.toThrow('REDIRECT:/access-denied');
  expect(state.read).not.toHaveBeenCalled();
 });
}

it.each([[Logs,"notifications.logs.view"],[Templates,"notifications.templates.view"],[DmsSettings,"dms.notifications.settings.manage"]] as const)(
 "rejects a scoped assignment for an ERP-wide administration page",async(Page,capability)=>{
  state.auth.mockResolvedValue({...syntheticAuthContext([capability]),globalPermissionCodes:[],roleAssignments:[{roleId:9,roleCode:"ordinary",ownerCompanyId:1,branchId:2,permissionCodes:[capability]}]});
  await expect(Page()).rejects.toThrow("REDIRECT:/access-denied");
  expect(state.read).not.toHaveBeenCalled();
 });

it("lets a report manager open the report templates catalogue",async()=>{
 state.auth.mockResolvedValue(syntheticAuthContext(["reports.manage"]));
 state.read.mockResolvedValue({success:true,data:[]});
 expect(await ReportTemplates()).toBeTruthy();
 expect(state.read).toHaveBeenCalledTimes(2);
});
