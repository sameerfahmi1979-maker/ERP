// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWorkspaceNavigationLock } from '@/hooks/use-workspace-navigation-lock';
vi.mock('sonner',()=>({toast:{warning:vi.fn()}}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function Lock({locked=true}:{locked?:boolean}) {useWorkspaceNavigationLock(locked);return <a href="/another-record">Other record</a>;}
function event(url:string,cancelable=true,type='traverse') {
 const e=new Event('navigate',{cancelable});Object.assign(e,{destination:{url},navigationType:type,hashChange:false,downloadRequest:null});return e;
}
it('cancels cancellable browser traversal before child state unmounts',()=>{
 const navigation=new EventTarget();vi.stubGlobal('navigation',navigation);render(<Lock/>);
 const e=event(new URL('/another-record',location.href).href);navigation.dispatchEvent(e);expect(e.defaultPrevented).toBe(true);
});
it('never traps browser-forced escape, reload, authentication redirect or download',()=>{
 const navigation=new EventTarget();vi.stubGlobal('navigation',navigation);render(<Lock/>);
 for(const e of [event('/another',false),event('/another',true,'reload'),event('/login')]) {navigation.dispatchEvent(e);expect(e.defaultPrevented).toBe(false);}
});
it('captures ordinary links even without Navigation API and unlocks cleanly',()=>{
 vi.stubGlobal('navigation',undefined);const ui=render(<Lock/>);
 expect(fireEvent.click(ui.getByText('Other record'))).toBe(false);
 ui.rerender(<Lock locked={false}/>);const navigation=new EventTarget();const e=event('/another');navigation.dispatchEvent(e);expect(e.defaultPrevented).toBe(false);
});
it('does not retain an unmounted dialog listener',()=>{
 const navigation=new EventTarget();vi.stubGlobal('navigation',navigation);const ui=render(<Lock/>);ui.unmount();const e=event('/another');navigation.dispatchEvent(e);expect(e.defaultPrevented).toBe(false);
});
