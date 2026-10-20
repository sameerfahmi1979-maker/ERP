// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi}from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor}from '@testing-library/react';
import {QueryClient,QueryClientProvider}from '@tanstack/react-query';
import {syntheticAuthContext}from '../../performance/fixtures/auth-context';
import type {AuthContext}from '@/lib/rbac/check';
import {RecordReadActivity}from '@/hooks/use-record-read-active';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/actions/hr/employees',()=>({getEmployeeEmploymentHistory:m.read}));
vi.mock('@/components/ui/button',()=>({Button:({variant,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string})=><button data-variant={variant}{...props}/>}));
import {EmployeeEmploymentHistory}from '@/features/hr/employees/employee-employment-history';
const auth=syntheticAuthContext(['hr.employees.view'],{id:7,auth_user_id:'synthetic-history-a'});
const clients:QueryClient[]=[];
const row=(id=5)=>({id,employee_id:7,old_values:{notice_period_days:1},new_values:{notice_period_days:0},reason:'PRIVATE_HISTORY_A',effective_date:'2026-10-19',created_at:'2026-10-19T01:00:00Z',created_by:7,revision:2});
const reply=(nextCursor:number|null=null)=>({success:true,data:{rows:[row()],nextCursor}});
beforeEach(()=>{m.read.mockReset().mockResolvedValue(reply());});
afterEach(()=>{cleanup();clients.splice(0).forEach(client=>client.clear());});
function mount(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);const tree=(context:AuthContext,active=true)=><QueryClientProvider client={client}><RecordReadActivity active={active}><EmployeeEmploymentHistory employeeId={7} authContext={context}/></RecordReadActivity></QueryClientProvider>;const view=render(tree(auth));return {...view,client,replace:(context:AuthContext,active=true)=>view.rerender(tree(context,active))};}
it('renders zero rather than missing data and keeps the compact table',async()=>{mount();await screen.findByText('PRIVATE_HISTORY_A');expect(screen.getByText('notice period days: 1 → 0')).toBeTruthy();expect(screen.queryByText('Edit columns')).toBeNull();expect(screen.queryByText('Edit filters')).toBeNull();});
it('failure is explicit and retry does not replace it with an empty history',async()=>{m.read.mockResolvedValueOnce({success:false,error:'Unavailable'});mount();await screen.findByRole('alert');expect(screen.queryByText('No employment changes recorded by this release.')).toBeNull();fireEvent.click(screen.getByText('Retry'));await screen.findByText('PRIVATE_HISTORY_A');expect(m.read).toHaveBeenCalledTimes(2);});
it('page continuation uses the server cursor only',async()=>{m.read.mockResolvedValueOnce(reply(5)).mockResolvedValueOnce({success:true,data:{rows:[{...row(4),reason:'Older'}],nextCursor:null}});mount();fireEvent.click(await screen.findByText('Load earlier changes'));await screen.findByText('Older');expect(m.read.mock.calls).toEqual([[7,undefined],[7,5]]);});
it('permission loss removes history from the page and the old cache',async()=>{const view=mount();await screen.findByText('PRIVATE_HISTORY_A');view.replace(syntheticAuthContext([],{id:7,auth_user_id:'synthetic-history-a'}));expect(screen.queryByText('PRIVATE_HISTORY_A')).toBeNull();expect(screen.getByRole('alert').textContent).toContain('current access');expect(JSON.stringify(view.client.getQueriesData({queryKey:['hr','employment-history']}))).not.toContain('PRIVATE_HISTORY_A');expect(m.read).toHaveBeenCalledOnce();});
it('a late old-actor reply cannot populate the new actors history',async()=>{let resolve!:(value:unknown)=>void;m.read.mockReturnValueOnce(new Promise(done=>{resolve=done;})).mockResolvedValueOnce({success:true,data:{rows:[],nextCursor:null}});const view=mount();await waitFor(()=>expect(m.read).toHaveBeenCalledOnce());view.replace(syntheticAuthContext(['hr.employees.view'],{id:8,auth_user_id:'synthetic-history-b'}));await screen.findByText('No employment changes recorded by this release.');await act(async()=>resolve(reply()));expect(screen.queryByText('PRIVATE_HISTORY_A')).toBeNull();expect(JSON.stringify(view.client.getQueriesData({queryKey:['hr','employment-history']}))).not.toContain('PRIVATE_HISTORY_A');});
it('hiding and returning to the section pauses reads and clears retained private history',async()=>{const view=mount();await screen.findByText('PRIVATE_HISTORY_A');view.replace(auth,false);expect(screen.queryByText('PRIVATE_HISTORY_A')).toBeNull();expect(JSON.stringify(view.client.getQueriesData({queryKey:['hr','employment-history']}))).not.toContain('PRIVATE_HISTORY_A');const calls=m.read.mock.calls.length;await act(async()=>Promise.resolve());expect(m.read).toHaveBeenCalledTimes(calls);view.replace(auth);await screen.findByText('PRIVATE_HISTORY_A');expect(m.read).toHaveBeenCalledTimes(calls+1);});
