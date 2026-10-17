// @vitest-environment node
import '../f05/setup';
import {afterAll,afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,renderHook,screen,waitFor} from '@testing-library/react';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import {EmailFeatureFlagsPanel} from '@/features/settings/email/email-feature-flags-panel';
import {AiFeatureFlagsPanel} from '@/features/settings/ai/ai-feature-flags-panel';
import {useProviderFlagChange} from '@/features/settings/use-provider-flag-change';
import type {EmailFeatureFlag} from '@/lib/email/providers/types';
import type {AiFeatureFlag} from '@/lib/ai/providers/types';
const dom=await vi.hoisted(async()=>{const {builtinEnvironments}=await import('vitest/runtime');return builtinEnvironments.jsdom.setup(globalThis,{jsdom:{url:'http://localhost:3000'}});});
afterAll(async()=>{await act(async()=>{await new Promise<void>(resolve=>setImmediate(resolve));});dom.teardown(globalThis);});
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc})}));
import {saveProviderFlagMutation} from '@/server/provider-save';
const m=vi.hoisted(()=>({email:vi.fn(),ai:vi.fn(),refresh:vi.fn(),toast:vi.fn()}));
vi.mock('@/server/actions/settings/email-settings',()=>({updateEmailFeatureFlag:m.email}));
vi.mock('@/server/actions/settings/ai-settings',()=>({updateAiFeatureFlag:m.ai}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh})}));
vi.mock('sonner',()=>({toast:{success:m.toast,error:vi.fn()}}));
vi.mock('@/components/erp/table/record-collection',()=>({RecordCollection:({rows,renderRecord}:{rows:AiFeatureFlag[],renderRecord:(row:AiFeatureFlag)=>React.ReactNode})=><>{rows.map(renderRecord)}</>}));
const email:EmailFeatureFlag={id:1,featureCode:'F06_EMAIL',featureName:'Synthetic email',workspaceRevision:'2',isEnabled:false,requiresApproval:true,updatedAt:'2026-10-03'};
const ai:AiFeatureFlag={id:2,featureCode:'F06_AI',featureName:'Synthetic AI',workspaceRevision:'3',isEnabled:false,requiresHumanReview:true,minConfidenceThreshold:0.8};
beforeEach(()=>{vi.resetAllMocks();for(const save of [m.email,m.ai])save.mockResolvedValue({success:true,data:{id:1,revision:'4',changed:true,replayed:false}});});afterEach(cleanup);
function mountEmail(patch:Partial<EmailFeatureFlag>={},canManage=true){render(<FluentProvider theme={webLightTheme}><EmailFeatureFlagsPanel flags={[{...email,...patch}]} onRefresh={m.refresh} canManage={canManage}/></FluentProvider>);}
function mountAi(patch:Partial<AiFeatureFlag>={}){render(<FluentProvider theme={webLightTheme}><AiFeatureFlagsPanel flags={[{...ai,...patch}]} canManage/></FluentProvider>);}
it('email enablement requires an accessible confirmation; cancellation does not write',async()=>{
 mountEmail();fireEvent.click(screen.getByRole('switch'));expect(await screen.findByRole('dialog',{name:'Enable email feature?'})).toBeTruthy();expect(m.email).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Keep disabled'}));expect(m.email).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();
});
it('confirmed email enablement carries true and the loaded revision',async()=>{
 mountEmail();fireEvent.click(screen.getByRole('switch'));fireEvent.click(await screen.findByRole('button',{name:'Confirm enable'}));await waitFor(()=>expect(m.refresh).toHaveBeenCalledOnce());
 expect(m.email).toHaveBeenCalledWith('F06_EMAIL',{is_enabled:true},{operationId:expect.any(String),revision:'2'});
});
it('lost email response pauses other writes and retries exactly the same operation',async()=>{
 m.email.mockRejectedValueOnce(Error('PRIVATE'));mountEmail({requiresApproval:false});fireEvent.click(screen.getByRole('switch'));
 const retry=await screen.findByRole('button',{name:'Retry unchanged setting'});expect(screen.getByRole('switch').getAttribute('aria-disabled')).toBe('true');expect(m.refresh).not.toHaveBeenCalled();
 expect(screen.queryByText('PRIVATE')).toBeNull();fireEvent.click(retry);await waitFor(()=>expect(m.refresh).toHaveBeenCalledOnce());expect(m.email.mock.calls[1]).toEqual(m.email.mock.calls[0]);
});
it('read-only and missing-revision email flags do not offer a writable switch',()=>{
 mountEmail({},false);fireEvent.click(screen.getByRole('switch'));expect(m.email).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();cleanup();
 mountEmail({workspaceRevision:undefined});expect(screen.getByRole('switch').getAttribute('aria-disabled')).toBe('true');
});
it('AI review removal requires confirmation and cannot bypass DMS review',async()=>{
 mountAi();fireEvent.click(screen.getByRole('switch',{name:'Human review for Synthetic AI'}));fireEvent.click(await screen.findByRole('button',{name:'Confirm removal'}));await waitFor(()=>expect(m.ai).toHaveBeenCalledOnce());expect(m.ai.mock.calls[0][1]).toEqual({requires_human_review:false});cleanup();
 mountAi({featureCode:'DMS_F06'});expect(screen.getByRole('switch',{name:'Human review for Synthetic AI'}).getAttribute('aria-disabled')).toBe('true');
});
it('uncertain AI flag result retains its request for a safe replay',async()=>{
 m.ai.mockResolvedValueOnce({success:false,uncertain:true});mountAi();fireEvent.click(screen.getByRole('switch',{name:'Toggle Synthetic AI'}));fireEvent.click(await screen.findByRole('button',{name:'Retry unchanged setting'}));await waitFor(()=>expect(m.refresh).toHaveBeenCalledOnce());expect(m.ai.mock.calls[1]).toEqual(m.ai.mock.calls[0]);
});
it('known failure displays an error and allows a new operation, not false success',async()=>{
 m.email.mockResolvedValueOnce({success:false,error:'The configuration changed.'});mountEmail({requiresApproval:false});fireEvent.click(screen.getByRole('switch'));await screen.findByText('The configuration changed.');expect(m.refresh).not.toHaveBeenCalled();expect(m.toast).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('switch'));await waitFor(()=>expect(m.refresh).toHaveBeenCalledOnce());expect(m.email.mock.calls[1][2].operationId).not.toBe(m.email.mock.calls[0][2].operationId);
});

// These synchronous callback seams do not simulate a real transition/RSC failure.
it.each(['email','ai'] as const)('%s confirmed save survives a synchronous refresh failure',async kind=>{
 m.refresh.mockImplementationOnce(()=>{throw Error('PRIVATE_REFRESH');});
 if(kind==='email')mountEmail({requiresApproval:false});else mountAi();
 fireEvent.click(screen.getByRole('switch',{name:kind==='email'?'Enable Synthetic email':'Toggle Synthetic AI'}));
 await waitFor(()=>expect(m.refresh).toHaveBeenCalledOnce());
 expect(await screen.findByText(/Setting saved.*could not be refreshed/)).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Retry unchanged setting'})).toBeNull();
 expect(screen.queryByText(/PRIVATE_REFRESH/)).toBeNull();
 expect(screen.getByRole('switch',{name:kind==='email'?'Enable Synthetic email':'Toggle Synthetic AI'}).getAttribute('aria-disabled')).not.toBe('true');
 const save=kind==='email'?m.email:m.ai;
 const original=save.mock.calls[0];
 fireEvent.click(screen.getByRole('button',{name:'Refresh settings'}));
 expect(m.refresh).toHaveBeenCalledTimes(2);expect(save).toHaveBeenCalledOnce();expect(save.mock.calls[0]).toEqual(original);
});
it('refresh-only retries never generate an operation or replay a confirmed mutation',async()=>{
 const uuid=vi.spyOn(crypto,'randomUUID');
 try{
  m.refresh.mockImplementationOnce(()=>{throw Error('PRIVATE_REFRESH');}).mockImplementationOnce(()=>{throw Error('PRIVATE_REFRESH');});
  const {result}=renderHook(()=>useProviderFlagChange(m.email,m.refresh));
  await act(()=>result.current.change('A','2',{is_enabled:true}));
  expect(result.current.uncertain).toBe(false);expect(result.current.refreshError).toMatch(/Setting saved/);
  await act(()=>result.current.retry());expect(m.email).toHaveBeenCalledOnce();
  act(()=>result.current.retryRefresh());expect(result.current.refreshError).toMatch(/could not be refreshed/);
  act(()=>result.current.retryRefresh());expect(result.current.refreshError).toBeNull();
  expect(m.refresh).toHaveBeenCalledTimes(3);expect(m.email).toHaveBeenCalledOnce();expect(uuid).toHaveBeenCalledOnce();
 }finally{uuid.mockRestore();}
});
it.each([false,true])('toast failure is isolated from refresh, including refresh failure=%s',async refreshFails=>{
 m.toast.mockImplementation(()=>{throw Error('PRIVATE_TOAST');});
 if(refreshFails)m.refresh.mockImplementation(()=>{throw Error('PRIVATE_REFRESH');});
 mountEmail({requiresApproval:false});fireEvent.click(screen.getByRole('switch'));
 await waitFor(()=>expect(m.refresh).toHaveBeenCalledOnce());expect(m.email).toHaveBeenCalledOnce();
 expect(screen.queryByRole('button',{name:'Retry unchanged setting'})).toBeNull();expect(screen.queryByText(/PRIVATE_/)).toBeNull();
 expect(screen.getByRole('switch').getAttribute('aria-disabled')).not.toBe('true');
 if(refreshFails)expect(screen.getByRole('button',{name:'Refresh settings'})).toBeTruthy();
});
it.each(['rejected','uncertain'] as const)('a %s mutation becomes confirmed even if replay refresh fails',async kind=>{
 if(kind==='rejected')m.email.mockRejectedValueOnce(Error('PRIVATE_RESPONSE'));
 else m.email.mockResolvedValueOnce({success:false,uncertain:true});
 m.refresh.mockImplementationOnce(()=>{throw Error('PRIVATE_REFRESH');});
 mountEmail({requiresApproval:false});fireEvent.click(screen.getByRole('switch'));
 fireEvent.click(await screen.findByRole('button',{name:'Retry unchanged setting'}));
 await waitFor(()=>expect(m.refresh).toHaveBeenCalledOnce());
 expect(m.email.mock.calls[1]).toEqual(m.email.mock.calls[0]);
 expect(screen.queryByRole('button',{name:'Retry unchanged setting'})).toBeNull();
 expect(screen.getByRole('button',{name:'Refresh settings'})).toBeTruthy();
});
it('confirmed A refresh recovery cannot clear or replace unknown B',async()=>{
 const second={...email,id:2,featureCode:'F06_SECOND',featureName:'Second email',requiresApproval:false};
 m.refresh.mockImplementationOnce(()=>{throw Error('PRIVATE_REFRESH');});
 m.email.mockResolvedValueOnce({success:true,data:{id:1,revision:'4',changed:true,replayed:false}})
  .mockResolvedValueOnce({success:false,uncertain:true});
 render(<FluentProvider theme={webLightTheme}><EmailFeatureFlagsPanel flags={[{...email,requiresApproval:false},second]} onRefresh={m.refresh} canManage/></FluentProvider>);
 fireEvent.click(screen.getByRole('switch',{name:'Enable Synthetic email'}));
 await screen.findByRole('button',{name:'Refresh settings'});
 fireEvent.click(screen.getByRole('switch',{name:'Enable Second email'}));
 const retry=await screen.findByRole('button',{name:'Retry unchanged setting'});const originalB=m.email.mock.calls[1];
 fireEvent.click(screen.getByRole('button',{name:'Refresh settings'}));
 expect(m.refresh).toHaveBeenCalledTimes(2);expect(m.email).toHaveBeenCalledTimes(2);
 expect(screen.getByRole('button',{name:'Retry unchanged setting'})).toBeTruthy();
 expect(screen.getByRole('switch',{name:'Enable Second email'}).getAttribute('aria-disabled')).toBe('true');
 fireEvent.click(retry);await waitFor(()=>expect(m.email).toHaveBeenCalledTimes(3));expect(m.email.mock.calls[2]).toEqual(originalB);
 expect(originalB[0]).toBe('F06_SECOND');
});
it('stale props stay server-driven and never borrow the confirmed receipt revision',async()=>{
 m.refresh.mockImplementationOnce(()=>{throw Error('PRIVATE_REFRESH');});
 const ui=(flag:EmailFeatureFlag)=><FluentProvider theme={webLightTheme}><EmailFeatureFlagsPanel flags={[flag]} onRefresh={m.refresh} canManage/></FluentProvider>;
 const original={...email,requiresApproval:false};const mounted=render(ui(original));
 fireEvent.click(screen.getByRole('switch'));await screen.findByRole('button',{name:'Refresh settings'});
 mounted.rerender(ui({...original}));expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
 m.email.mockResolvedValueOnce({success:false,error:'This flag changed. Refresh and compare.'});
 fireEvent.click(screen.getByRole('switch'));await screen.findByText('This flag changed. Refresh and compare.');
 expect(m.email.mock.calls[1][1]).toEqual({is_enabled:true});expect(m.email.mock.calls[1][2].revision).toBe('2');
 expect(m.email.mock.calls[1][2].operationId).not.toBe(m.email.mock.calls[0][2].operationId);
 mounted.rerender(ui({...original,workspaceRevision:'4',isEnabled:true}));
 expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');fireEvent.click(screen.getByRole('switch'));
 await waitFor(()=>expect(m.email).toHaveBeenCalledTimes(3));
 expect(m.email.mock.calls[2][1]).toEqual({is_enabled:false});expect(m.email.mock.calls[2][2].revision).toBe('4');
});
it('unknown retry ignores newer props and double clicks remain one in-flight operation',async()=>{
 let resolve!:(value:{success:boolean;uncertain?:boolean})=>void;
 m.email.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const ui=(revision:string)=><FluentProvider theme={webLightTheme}><EmailFeatureFlagsPanel flags={[{...email,requiresApproval:false,workspaceRevision:revision}]} onRefresh={m.refresh} canManage/></FluentProvider>;
 const mounted=render(ui('2'));fireEvent.click(screen.getByRole('switch'));fireEvent.click(screen.getByRole('switch'));expect(m.email).toHaveBeenCalledOnce();
 await act(async()=>resolve({success:false,uncertain:true}));mounted.rerender(ui('99'));
 fireEvent.click(screen.getByRole('button',{name:'Retry unchanged setting'}));await waitFor(()=>expect(m.email).toHaveBeenCalledTimes(2));
 expect(m.email.mock.calls[1]).toEqual(m.email.mock.calls[0]);expect(m.email.mock.calls[1][2].revision).toBe('2');
});
it('read-only refresh recovery does not require mutation permission',async()=>{
 m.refresh.mockImplementationOnce(()=>{throw Error('PRIVATE_REFRESH');});
 const ui=(canManage:boolean)=><FluentProvider theme={webLightTheme}><EmailFeatureFlagsPanel flags={[{...email,requiresApproval:false}]} onRefresh={m.refresh} canManage={canManage}/></FluentProvider>;
 const mounted=render(ui(true));fireEvent.click(screen.getByRole('switch'));await screen.findByRole('button',{name:'Refresh settings'});
 mounted.rerender(ui(false));fireEvent.click(screen.getByRole('button',{name:'Refresh settings'}));expect(m.refresh).toHaveBeenCalledTimes(2);expect(m.email).toHaveBeenCalledOnce();
});

it.each(['email','ai'] as const)('W30 %s retains unknown through known rejection using the real flag helper',async kind=>{
 const save=kind==='email'?m.email:m.ai,flag=kind==='email'?email:ai;
 save.mockImplementation((code,payload,contract)=>saveProviderFlagMutation(kind,code,payload,contract));
 rpc.mockResolvedValueOnce({error:{code:'40003',message:'PRIVATE_RPC',details:'PRIVATE_DETAILS',hint:'PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40P01',message:'PRIVATE_RPC'}}).mockResolvedValueOnce({data:{id:flag.id,revision:'4',changed:false,replayed:true}});
 if(kind==='email')mountEmail({requiresApproval:false});else mountAi();
 fireEvent.click(screen.getByRole('switch',{name:kind==='email'?'Enable Synthetic email':'Toggle Synthetic AI'}));
 fireEvent.click(await screen.findByRole('button',{name:'Retry unchanged setting'}));
 await waitFor(()=>expect(rpc).toHaveBeenCalledTimes(2));
 expect(screen.getByRole('button',{name:'Retry unchanged setting'})).toBeTruthy();expect(m.refresh).not.toHaveBeenCalled();expect(m.toast).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('switch',{name:kind==='email'?'Enable Synthetic email':'Toggle Synthetic AI'}));expect(rpc).toHaveBeenCalledTimes(2);
 fireEvent.click(screen.getByRole('button',{name:'Retry unchanged setting'}));await waitFor(()=>expect(m.refresh).toHaveBeenCalledOnce());
 const expected=['save_provider_feature_flag',{p_kind:kind,p_code:flag.featureCode,p_data:{is_enabled:true},p_operation:save.mock.calls[0][2].operationId,p_revision:flag.workspaceRevision}];
 expect(rpc.mock.calls).toEqual([expected,expected,expected]);expect(document.body.textContent).not.toMatch(/PRIVATE_|rolled back|previous configuration/);
});
it('W30 08007 retains a copied flag payload until replay and known-first failure permits a new operation',async()=>{
 m.email.mockImplementation((code,payload,contract)=>saveProviderFlagMutation('email',code,payload,contract));
 rpc.mockResolvedValueOnce({error:{code:'08007'}}).mockResolvedValueOnce({error:{code:'40P01'}}).mockResolvedValueOnce({data:{id:1,revision:'4',changed:false,replayed:true}});
 const {result}=renderHook(()=>useProviderFlagChange(m.email,m.refresh));const payload={is_enabled:true};
 await act(()=>result.current.change('F06_EMAIL','2',payload));payload.is_enabled=false;
 await act(()=>result.current.retry());expect(result.current.uncertain).toBe(true);
 await act(()=>result.current.change('OTHER','99',{is_enabled:false}));expect(rpc).toHaveBeenCalledTimes(2);
 await act(()=>result.current.retry());const expected=['save_provider_feature_flag',{p_kind:'email',p_code:'F06_EMAIL',p_data:{is_enabled:true},p_operation:m.email.mock.calls[0][2].operationId,p_revision:'2'}];expect(rpc.mock.calls).toEqual([expected,expected,expected]);
 rpc.mockResolvedValueOnce({error:{code:'40P01'}}).mockResolvedValueOnce({data:{id:1,revision:'4',changed:true,replayed:false}});
 await act(()=>result.current.change('F06_EMAIL','2',{is_enabled:false}));expect(result.current.uncertain).toBe(false);await act(()=>result.current.change('F06_EMAIL','2',{is_enabled:true}));expect(m.email.mock.calls[4][2].operationId).not.toBe(m.email.mock.calls[3][2].operationId);
});
