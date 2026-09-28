// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserEffectiveAccessSection } from '@/features/users/user-effective-access-section';
import type { AuthContext } from '@/lib/rbac/check';
const calls=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('@/server/actions/users/effective-access',()=>({getUserEffectiveAccess:calls.get}));
const context=(allowed:boolean, viewer=90001)=>({profile:{id:viewer},roleCodes:[],permissionCodes:allowed?['users.view']:[]} as unknown as AuthContext);
const permission=(name:string)=>({permission_code:name,permission_name:name,module_code:'synthetic',source_role_code:'test',scope_type:'company'});
afterEach(()=>{cleanup();vi.resetAllMocks();});
describe('effective-access query lifecycle',()=>{
 it('denied-to-allowed-to-denied is hook-safe and never fetches for a denied viewer',async()=>{
  calls.get.mockResolvedValue({success:true,data:[permission('TEST_PERMISSION')]});
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const view=(allowed:boolean)=><QueryClientProvider client={client}><UserEffectiveAccessSection userProfileId={90002} authContext={context(allowed)}/></QueryClientProvider>;
  const ui=render(view(false)); expect(calls.get).not.toHaveBeenCalled();
  ui.rerender(view(true)); await waitFor(()=>expect(ui.getAllByText('TEST_PERMISSION').length).toBeGreaterThan(0));
  ui.rerender(view(false)); expect(ui.queryByText('TEST_PERMISSION')).toBeNull();
  expect(calls.get).toHaveBeenCalledTimes(1); client.clear();
 });
 it('late responses for one target cannot replace the newly selected target',async()=>{
  let resolveOld!:(value:unknown)=>void;
  calls.get.mockImplementation((id:number)=>id===90002?new Promise(r=>{resolveOld=r;}):Promise.resolve({success:true,data:[permission('NEW_TARGET')]}));
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const view=(id:number)=><QueryClientProvider client={client}><UserEffectiveAccessSection userProfileId={id} authContext={context(true)}/></QueryClientProvider>;
  const ui=render(view(90002)); ui.rerender(view(90003));
  await waitFor(()=>expect(ui.getAllByText('NEW_TARGET').length).toBeGreaterThan(0));
  await act(async()=>resolveOld({success:true,data:[permission('OLD_TARGET')]}));
  expect(ui.queryByText('OLD_TARGET')).toBeNull(); expect(ui.getAllByText('NEW_TARGET').length).toBeGreaterThan(0); client.clear();
 });
 it('failed actions display an error rather than a misleading empty success',async()=>{
  calls.get.mockResolvedValue({success:false,error:'Synthetic denied result'});
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const ui=render(<QueryClientProvider client={client}><UserEffectiveAccessSection userProfileId={90002} authContext={context(true)}/></QueryClientProvider>);
  await waitFor(()=>expect(ui.getByText('Synthetic denied result')).toBeTruthy());
  expect(ui.queryByText('This user has no assigned permissions.')).toBeNull(); client.clear();
 });
});
