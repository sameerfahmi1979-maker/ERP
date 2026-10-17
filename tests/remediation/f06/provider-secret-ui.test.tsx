// @vitest-environment node
import '../f05/setup';
import {useState} from 'react';
import {afterAll,afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {EmailProviderSecretDialog} from '@/features/settings/email/email-provider-secret-dialog';
const dom=await vi.hoisted(async()=>{const {builtinEnvironments}=await import('vitest/runtime');return builtinEnvironments.jsdom.setup(globalThis,{jsdom:{url:'http://localhost:3000'}});});
afterAll(async()=>{await act(async()=>{await new Promise<void>(resolve=>setImmediate(resolve));});dom.teardown(globalThis);});
const ports=vi.hoisted(()=>({rpc:vi.fn(),admin:vi.fn(),claims:vi.fn(),auth:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:ports.rpc,auth:{getClaims:ports.claims}})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:ports.admin})}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:ports.auth}));
import {saveOrCheckEmailCredential} from '@/server/provider-secret';
const m=vi.hoisted(()=>({save:vi.fn(),probe:vi.fn(),success:vi.fn(),closed:vi.fn(),toast:vi.fn()}));
const refresh=vi.hoisted(()=>vi.fn());
vi.mock('next/navigation',()=>({usePathname:()=>'/synthetic',useRouter:()=>({refresh})}));
vi.mock('@/server/actions/settings/email-settings',()=>({saveEmailProviderSecret:m.save,checkEmailProviderSecretSave:m.probe}));
vi.mock('sonner',()=>({toast:{success:m.toast,error:vi.fn()}}));
beforeEach(()=>{vi.resetAllMocks();});afterEach(cleanup);
const renderDialog=(revision:string|null='7')=>render(<EmailProviderSecretDialog open providerId={41} providerRevision={revision??undefined} providerName="Synthetic" currentMaskedPreview={null} onOpenChange={m.closed} onSuccess={m.success}/>);
const fill=()=>fireEvent.change(screen.getByLabelText('Client secret'),{target:{value:'synthetic-private-only'}});
it('a missing loaded revision cannot submit a credential',()=>{
 renderDialog(null);fill();fireEvent.click(screen.getByRole('button',{name:'Save to Vault'}));expect(m.save).not.toHaveBeenCalled();
});
it('successful secret submission carries expected revision/operation and clears input',async()=>{
 m.save.mockResolvedValue({success:true,data:{id:41,revision:'8',changed:true,replayed:false}});renderDialog();fill();fireEvent.click(screen.getByRole('button',{name:'Save to Vault'}));
 await waitFor(()=>expect(m.success).toHaveBeenCalledOnce());expect(m.save).toHaveBeenCalledWith({id:41,secret_value:'synthetic-private-only'},{revision:'7',operationId:expect.any(String)});expect((screen.getByLabelText('Client secret') as HTMLInputElement).value).toBe('');
});
it('lost response clears the secret, blocks another save and probes only the retained operation',async()=>{
 m.save.mockRejectedValue(new Error('private-provider-response'));m.probe.mockResolvedValue({success:true,data:{id:41,revision:'8',changed:true,replayed:true}});renderDialog();fill();fireEvent.click(screen.getByRole('button',{name:'Save to Vault'}));
 const probe=await screen.findByRole('button',{name:'Check save result'});expect((screen.getByLabelText('Client secret') as HTMLInputElement).value).toBe('');expect(screen.queryByText(/private-provider-response/)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Save to Vault'}));expect(m.save).toHaveBeenCalledOnce();fireEvent.click(probe);await waitFor(()=>expect(m.success).toHaveBeenCalledOnce());
 expect(m.probe).toHaveBeenCalledWith(41,m.save.mock.calls[0][1]);expect(JSON.stringify(m.probe.mock.calls)).not.toContain('synthetic-private-only');
});
it('an inconclusive probe remains paused and cannot be treated as success',async()=>{
 m.save.mockResolvedValue({success:false,uncertain:true,error:'Save unconfirmed'});m.probe.mockResolvedValue({success:false,uncertain:true,error:'Check unavailable'});renderDialog();fill();fireEvent.click(screen.getByRole('button',{name:'Save to Vault'}));
 fireEvent.click(await screen.findByRole('button',{name:'Check save result'}));await screen.findByText('Check unavailable');expect(m.success).not.toHaveBeenCalled();expect((screen.getByRole('button',{name:'Save to Vault'}) as HTMLButtonElement).disabled).toBe(true);
});
it('confirmed rollback clears sensitive input and permits a fresh operation',async()=>{
 m.save.mockResolvedValueOnce({success:false,error:'Change rolled back'}).mockResolvedValueOnce({success:true,data:{id:41,revision:'8',changed:true,replayed:false}});renderDialog();fill();fireEvent.click(screen.getByRole('button',{name:'Save to Vault'}));
 await screen.findByText('Change rolled back');expect((screen.getByLabelText('Client secret') as HTMLInputElement).value).toBe('');fill();fireEvent.click(screen.getByRole('button',{name:'Save to Vault'}));await waitFor(()=>expect(m.success).toHaveBeenCalledOnce());expect(m.save.mock.calls[0][1].operationId).not.toBe(m.save.mock.calls[1][1].operationId);
});

it.each(['direct','probe'] as const)('confirmed %s secret result survives display failure without another write or check',async mode=>{
 const marker='PRIVATE_EFFECT';m.toast.mockImplementation(()=>{throw Error(marker);});m.closed.mockImplementation(()=>{throw Error(marker);});m.success.mockImplementation(()=>{throw Error(marker);});
 m.save.mockResolvedValue(mode==='direct'?{success:true,data:{id:41,revision:'8',changed:false,replayed:true}}:{success:false,uncertain:true});m.probe.mockResolvedValue({success:true,data:{id:41,revision:'8',changed:true,replayed:true}});renderDialog();fill();fireEvent.click(screen.getByRole('button',{name:'Save to Vault'}));
 if(mode==='probe')fireEvent.click(await screen.findByRole('button',{name:'Check save result'}));
 await waitFor(()=>expect(m.success).toHaveBeenCalledOnce());expect(m.toast).toHaveBeenCalledOnce();expect(m.closed).toHaveBeenCalledExactlyOnceWith(false);expect(screen.getByText(/Credential save confirmed/)).toBeTruthy();expect(screen.queryByRole('button',{name:'Check save result'})).toBeNull();expect((screen.getByLabelText('Client secret') as HTMLInputElement).value).toBe('');
 fireEvent.click(screen.getByRole('button',{name:'Refresh settings only'}));fireEvent.click(screen.getByRole('button',{name:'Refresh settings only'}));fireEvent.click(screen.getByRole('button',{name:'Save to Vault'}));expect(m.save).toHaveBeenCalledOnce();expect(m.probe).toHaveBeenCalledTimes(mode==='probe'?1:0);expect(refresh).toHaveBeenCalledTimes(2);expect(document.body.textContent).not.toMatch(/PRIVATE_EFFECT|unconfirmed|not been saved/);
 if(mode==='probe')expect(m.probe).toHaveBeenCalledWith(41,m.save.mock.calls[0][1]);
});

it.each(['direct','probe'] as const)('confirmed %s credential really dismisses before a throwing parent effect, then reopens cleanly',async mode=>{
 m.save.mockResolvedValue(mode==='direct'?{success:true,data:{id:41,revision:'8',changed:true,replayed:false}}:{success:false,uncertain:true});m.probe.mockResolvedValue({success:true,data:{id:41,revision:'8',changed:true,replayed:true}});m.success.mockImplementation(()=>{throw Error('PRIVATE_EFFECT');});
 function Parent(){const [open,setOpen]=useState(true);return <><button onClick={()=>setOpen(true)}>Reopen</button><EmailProviderSecretDialog open={open} providerId={41} providerRevision="7" providerName="Synthetic" currentMaskedPreview={null} onOpenChange={setOpen} onSuccess={m.success}/></>;}
 render(<Parent/>);fill();fireEvent.click(screen.getByRole('button',{name:'Save to Vault'}));if(mode==='probe')fireEvent.click(await screen.findByRole('button',{name:'Check save result'}));await waitFor(()=>expect(m.success).toHaveBeenCalledOnce());expect(screen.queryByRole('dialog')).toBeNull();expect(document.body.textContent).not.toMatch(/PRIVATE_EFFECT|unconfirmed|not been saved/);fireEvent.click(screen.getByRole('button',{name:'Reopen'}));expect((screen.getByLabelText('Client secret') as HTMLInputElement).value).toBe('');expect(m.save).toHaveBeenCalledOnce();expect(m.probe).toHaveBeenCalledTimes(mode==='probe'?1:0);
});

it.each(['40003','08007'])('W30 %s credential write stays unknown through known secret-free probe failure',async code=>{
 ports.auth.mockResolvedValue({profile:{id:101,must_change_password:false},isAccountActive:true,globalPermissionCodes:['settings.email.secrets.manage'],roleAssignments:[]});
 ports.claims.mockResolvedValue({data:{claims:{session_id:'synthetic-session'}}});ports.rpc.mockImplementation(async(name)=>{expect(name).toBe('f03_current_session_valid');return {data:true};});
 ports.admin.mockResolvedValueOnce({error:{code,message:'PRIVATE_RPC',details:'PRIVATE_DETAILS',hint:'PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40P01',message:'PRIVATE_RPC'}}).mockResolvedValueOnce({data:{id:41,revision:'8',changed:false,replayed:true}});
 m.save.mockImplementation((input,contract)=>saveOrCheckEmailCredential(input.id,input.secret_value,contract));m.probe.mockImplementation((id,contract)=>saveOrCheckEmailCredential(id,null,contract));
 renderDialog();fill();fireEvent.click(screen.getByRole('button',{name:'Save to Vault'}));fireEvent.click(await screen.findByRole('button',{name:'Check save result'}));await waitFor(()=>expect(ports.admin).toHaveBeenCalledTimes(2));
 expect(await screen.findByText(/earlier credential save is still unconfirmed/i)).toBeTruthy();expect(document.body.textContent).not.toMatch(/rolled back|previous configuration|PRIVATE_/);expect((screen.getByLabelText('Client secret') as HTMLInputElement).value).toBe('');expect((screen.getByRole('button',{name:'Save to Vault'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Check save result'}));await waitFor(()=>expect(m.success).toHaveBeenCalledOnce());
 const base={p_actor:101,p_session:'synthetic-session',p_id:41,p_revision:'7',p_operation:m.save.mock.calls[0][1].operationId};expect(ports.admin.mock.calls).toEqual(['synthetic-private-only',null,null].map(p_secret=>['save_email_provider_secret',{...base,p_secret}]));expect(ports.rpc.mock.calls).toEqual(Array.from({length:3},()=>['f03_current_session_valid']));expect(m.save).toHaveBeenCalledOnce();expect(m.probe).toHaveBeenCalledTimes(2);
});
