import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({inserts:[] as any[],updates:[] as any[],message:null as any,result:{ok:true,status:'sent'} as any,throwTransport:false,throwConfig:false,failReceipt:false}));
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({headers:async()=>new Headers()}));
vi.mock('@/lib/logger',()=>({logger:{warn:vi.fn()}}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>({
 insert:async(row:any)=>{state.inserts.push({table,row});return {error:null};},
 update:(row:any)=>({eq:async()=>{state.updates.push({table,row});return {error:state.failReceipt?{message:'synthetic fault'}:null};}}),
 select:()=>({eq:()=>({eq:()=>({is:()=>({maybeSingle:async()=>({data:{subject_template:'Hello {{display_name}}',text_template:'{{action_link}}',html_template:'<a href="{{action_link}}">{{display_name}}</a>'},error:null})})})})}),
})})}));
vi.mock('@/lib/email/providers/factory',()=>({getDefaultEmailProviderSystem:async()=>{
 if(state.throwConfig)throw new Error('synthetic configuration failure');
 return {sendEmail:async(message:any)=>{state.message=message;if(state.throwTransport)throw new Error('synthetic timeout');return state.result;}};
}}));
import { sendSecurityTemplate } from '@/lib/auth/security-email';
const input={to:'synthetic@example.invalid',profileId:42,kind:'invite' as const,variables:{display_name:'<script>test</script>\r\nInjected:',action_link:'https://erp.invalid/auth/confirm?code=synthetic&x="quoted"'}};
beforeEach(()=>{state.inserts=[];state.updates=[];state.message=null;state.result={ok:true,status:'sent'};state.throwTransport=false;state.throwConfig=false;state.failReceipt=false;});
it('records provider acceptance, not inbox delivery, with no link/body in journal',async()=>{
 const r=await sendSecurityTemplate(input);expect(r.accepted).toBe(true);expect(r.recorded).toBe(true);expect(state.updates[0].row.state).toBe('provider_accepted');
 const journal=JSON.stringify([state.inserts,state.updates]);expect(journal).not.toContain('synthetic&x');expect(journal).not.toContain('script');expect(journal).not.toContain(input.to);
});
it('escapes HTML variables and removes subject header newlines',async()=>{
 await sendSecurityTemplate(input);expect(state.message.htmlBody).toContain('&lt;script&gt;');expect(state.message.htmlBody).toContain('&amp;x=&quot;quoted&quot;');expect(state.message.subject).not.toMatch(/[\r\n]/);
});
it('records interrupted transport as unknown with no automatic resend',async()=>{
 state.throwTransport=true;const r=await sendSecurityTemplate(input);expect(r.accepted).toBe(false);expect(state.updates[0].row.state).toBe('unknown');expect(state.inserts).toHaveLength(1);
});
it('does not mistake an adapter-wrapped timeout for definite non-delivery',async()=>{
 state.result={ok:false,status:'failed'};expect((await sendSecurityTemplate(input)).accepted).toBe(false);expect(state.updates[0].row.state).toBe('unknown');
});
it('records a skipped transport as a definite non-send',async()=>{
 state.result={ok:false,status:'skipped'};await sendSecurityTemplate(input);expect(state.updates[0].row.state).toBe('failed');
});
it('records configuration failure before transport as a non-send',async()=>{
 state.throwConfig=true;await sendSecurityTemplate(input);expect(state.message).toBeNull();expect(state.updates[0].row.state).toBe('failed');
});
it('keeps acceptance distinct from a failed receipt write',async()=>{
 state.failReceipt=true;const r=await sendSecurityTemplate(input);expect(r.accepted).toBe(true);expect(r.recorded).toBe(false);
});
