import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),client:vi.fn(),admin:vi.fn(),permit:vi.fn(),delivery:vi.fn(),audit:vi.fn(),cache:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,hasPermission:m.permit,hasGlobalPermission:m.permit,hasPermissionInScope:m.permit}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
import {activateNotificationTemplate,deactivateNotificationTemplate,updateNotificationTemplate} from '@/server/actions/notifications/templates';
type Result={data:unknown;error?:null|{code?:string;message?:string}};
function database(results:Result[]){
 const writes:unknown[]=[], reads:string[]=[];
 const builder:Record<string,unknown>={};
 for(const name of ['select','eq','is','order','limit','maybeSingle','single'])builder[name]=vi.fn((...args:unknown[])=>{if(name==='select')reads.push(String(args[0]));return builder;});
 for(const name of ['insert','update'])builder[name]=vi.fn((value:unknown)=>{writes.push(value);return builder;});
 builder.then=(ok:(r:Result)=>unknown)=>Promise.resolve(results.shift()??{data:null,error:null}).then(ok);
 return {from:vi.fn(()=>builder),writes,reads};
}
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({profile:{id:5}});m.permit.mockReturnValue(true);m.audit.mockResolvedValue(undefined);m.admin.mockReturnValue(database([]));});
it.each([[true,activateNotificationTemplate],[false,deactivateNotificationTemplate]] as const)('template active state %s is actually written',async(active,action)=>{
 const db=database([{data:{id:7}}]);m.client.mockResolvedValue(db);expect((await action(7)).success).toBe(true);expect(db.writes[0]).toMatchObject({is_active:active});
});
it('template zero-row update and database errors never report success',async()=>{
 for(const response of [{data:null},{data:null,error:{message:'private'}}]){m.client.mockResolvedValue(database([response]));expect((await deactivateNotificationTemplate(7)).success).toBe(false);}
 expect(m.audit).not.toHaveBeenCalled();
});
it('template mutation requires permission and strict validated fields',async()=>{
 const db=database([]);m.client.mockResolvedValue(db);m.permit.mockReturnValue(false);expect((await activateNotificationTemplate(7)).success).toBe(false);m.permit.mockReturnValue(true);
 expect((await updateNotificationTemplate(7,{unexpected:'field'} as never)).success).toBe(false);expect((await activateNotificationTemplate(-1)).success).toBe(false);expect(db.writes).toHaveLength(0);
});
