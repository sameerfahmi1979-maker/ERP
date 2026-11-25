// @vitest-environment jsdom
import '../f05/setup';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => nav,
}));
import { AppSidebar } from '@/components/layout/app-sidebar';
import { OpenWorkspaces } from '@/components/workspace/open-workspaces';
import { WorkspaceContent } from '@/components/workspace/workspace-content';
import { WorkspaceDraftProvider } from '@/components/workspace/workspace-draft-provider';
import { WorkspaceProvider, useWorkspaceContext } from '@/components/workspace/workspace-provider';
import { persistToStorage } from '@/lib/workspace/workspace-store';
import { createTabFromRoute } from '@/lib/workspace/workspace-route-registry';
let engine:NonNullable<ReturnType<typeof useWorkspaceContext>>;
const permitted = () => true;
function Observe({sidebar=false}:{sidebar?:boolean}) {
  engine=useWorkspaceContext()!;
  return <><OpenWorkspaces/>{sidebar&&<AppSidebar isGlobalAdmin collapsed={false} onToggle={()=>{}}/>}<WorkspaceContent><p>Visible workspace body</p></WorkspaceContent></>;
}
function app(sidebar=false) {
  return <FluentProvider theme={webLightTheme}><WorkspaceDraftProvider><WorkspaceProvider principalId="speed-ui-second" canRestoreRoute={permitted}><Observe sidebar={sidebar}/></WorkspaceProvider></WorkspaceDraftProvider></FluentProvider>;
}
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();});
afterEach(cleanup);
it.each([1,30])('restores %i saved workspaces and skips router pushes for the same active route',async(count)=>{
  const tabs = ['/dashboard', ...Array.from({length:count},(_,i)=>'/admin/hr/employees/record/'+(i+1))].map(route=>createTabFromRoute(route)!);
  persistToStorage(tabs,tabs[0].id,'speed-ui-second');
  const stored = Object.keys(localStorage).map(k=>localStorage.getItem(k)).find(v=>v?.includes('speed-ui-second'))!;
  const markup=renderToString(app());
  expect(markup).toContain('Preparing workspace');
  expect(markup).not.toContain('Visible workspace body');
  render(app());
  await screen.findByText('Visible workspace body');
  expect(engine.state.tabs).toHaveLength(count+1);
  expect(nav.push).not.toHaveBeenCalled();
  expect(nav.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:/^Open workspaces/}));
  const list=screen.getByRole('list',{name:'Workspaces'});
  expect(within(list).getAllByRole('listitem')).toHaveLength(count+1);
  const home=within(list).getAllByRole('button').find(node=>node.getAttribute('aria-current')==='page')!;
  fireEvent.mouseEnter(home);
  expect(nav.prefetch).not.toHaveBeenCalled();
  fireEvent.click(home);
  expect(nav.push).not.toHaveBeenCalled();

});
it('the mounted sidebar issues a default prefetch on hover with no navigation',async()=>{
 render(app(true));
 await screen.findByText('Visible workspace body');
 const search=screen.getByRole('textbox',{name:"Find a page in navigation"});
 fireEvent.change(search,{target:{value:'employees'}});
 const link=screen.getAllByRole('button',{name:'Employees'}).find(x=>!x.hasAttribute('aria-expanded'))!;
 expect(link).toBeTruthy();
 fireEvent.mouseEnter(link);
 expect(nav.prefetch).toHaveBeenCalledWith('/admin/hr/employees');
 expect(nav.push).not.toHaveBeenCalled();
 expect(nav.replace).not.toHaveBeenCalled();
});
