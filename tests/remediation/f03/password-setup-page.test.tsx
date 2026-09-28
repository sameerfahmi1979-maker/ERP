import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const m=vi.hoisted(()=>({flow:null as null|{hash:string;type:'invite'|'recovery'},getFlow:vi.fn(),valid:true,user:true}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:m.user?{id:'actor'}:null},error:null}),getClaims:async()=>({data:{claims:{session_id:'session'}},error:null})},rpc:async()=>({data:m.valid,error:null})})}));
vi.mock('@/lib/auth/password-flow',()=>({getPasswordFlowContext:m.getFlow}));
vi.mock('@/lib/branding/load-runtime-app-branding',()=>({loadRuntimeAppBranding:async()=>({appName:'ALGT ERP',supportEmail:'erp@example.invalid'})}));
vi.mock('@/features/auth/reset-password-form',()=>({ResetPasswordForm:()=>null}));
import ResetPage from '@/app/(auth)/reset-password/page';
import ErrorPage from '@/app/(auth)/auth/link-error/page';
beforeEach(()=>{vi.clearAllMocks();m.flow=null;m.valid=true;m.user=true;m.getFlow.mockImplementation(async()=>m.flow);});
it.each(['invite','recovery'] as const)('passes verified %s presentation context but never a proof/hash to the form',async type=>{
 m.flow={hash:'SECRET_SERVER_PROOF',type};const tree=await ResetPage();
 expect(tree.props).toEqual({flow:type});expect(JSON.stringify(tree.props)).not.toContain('SECRET_');
 expect(m.getFlow).toHaveBeenCalledWith('actor','session');
});
it.each(['missing','invalid-session','anonymous','lookup-error'])('renders safe recovery guidance for %s',async reason=>{
 if(reason==='invalid-session')m.valid=false;if(reason==='anonymous')m.user=false;if(reason==='lookup-error')m.getFlow.mockRejectedValue(new Error('SECRET_ERROR'));
 const html=renderToStaticMarkup(await ResetPage());
 expect(html).toContain('Password link required');expect(html).toContain('Do not reopen the consumed invitation');expect(html).toContain('href="/forgot-password"');expect(html).not.toContain('SECRET_');
 if(reason==='anonymous'||reason==='invalid-session')expect(m.getFlow).not.toHaveBeenCalled();
});
it('offers same-browser resume and new recovery after an interrupted invitation without consuming proof',async()=>{
 const html=renderToStaticMarkup(await ErrorPage({searchParams:Promise.resolve({flow:'invite',reason:'invalid_invite_link'})}));
 expect(html).toContain('href="/reset-password"');expect(html).toContain('href="/forgot-password"');expect(html).toContain('never began activation');expect(m.getFlow).not.toHaveBeenCalled();
});
it('does not offer resume/reset links for a different signed-in account',async()=>{
 const html=renderToStaticMarkup(await ErrorPage({searchParams:Promise.resolve({flow:'invite',reason:'account_mismatch'})}));
 expect(html).toContain('has not been replaced');expect(html).toContain('private browser window');expect(html).not.toContain('href="/reset-password"');expect(html).not.toContain('href="/forgot-password"');
});
it('keeps recovery errors separate from invitation resend instructions',async()=>{
 const html=renderToStaticMarkup(await ErrorPage({searchParams:Promise.resolve({flow:'recovery',reason:'invalid_invite_link'})}));
 expect(html).toContain('This reset link');expect(html).toContain('href="/forgot-password"');expect(html).not.toContain('24 hours');expect(html).not.toContain('href="/reset-password"');
});
