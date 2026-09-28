// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWorkspaceDraftStore, snapshotFormData } from '@/lib/workspace/workspace-draft-store';
const context=vi.hoisted(()=>({active:'a',pathname:'/admin/hr/employees/record/new',dispatch:vi.fn(),store:null as ReturnType<typeof createWorkspaceDraftStore>|null}));
vi.mock('next/navigation',()=>({usePathname:()=>context.pathname}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>({state:{activeTabId:context.active,isHydrated:true,tabs:[{id:'a',route:'/admin/hr/employees/record/new'},{id:'b',route:'/dashboard'}]},dispatch:context.dispatch})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>context.store}));
import { useWorkspaceFormDraft } from '@/hooks/use-workspace-form-draft';
import { useWorkspaceTabDirty } from '@/hooks/use-workspace-tab-dirty';
import { useWorkspaceFormDirty } from '@/hooks/use-workspace-form-dirty';
beforeEach(()=>{context.active='a';context.pathname='/admin/hr/employees/record/new';context.store=createWorkspaceDraftStore();context.dispatch.mockClear();vi.useFakeTimers();});
afterEach(()=>{cleanup();vi.useRealTimers();});
function Form(){const draft=useWorkspaceFormDraft({formId:'test-form'});return <form id="test-form" onInput={draft.syncDraft}><input aria-label="Name" name="full_name" defaultValue={draft.getDraftDefault('full_name')}/></form>;}
function LegacyForm(){
 const dirty=useWorkspaceFormDirty({formId:'test-form',enabled:true});
 const draft=useWorkspaceFormDraft({formId:'test-form'});
 useWorkspaceTabDirty({isDirty:dirty.isDirty});
 return <><form id="test-form" onInput={draft.syncDraft}><input aria-label="Name" name="full_name" defaultValue={draft.getDraftDefault('full_name')}/></form><output>{dirty.isDirty?'Unsaved':'Clean'}</output><button onClick={()=>{draft.clearDraft();dirty.resetDirty();}}>Accept save</button></>;
}
it('legacy restored draft stays dirty instead of a clean mount effect overriding its close warning',()=>{
 const first=render(<LegacyForm/>);fireEvent.input(first.getByLabelText('Name'),{target:{value:'Synthetic retained'}});first.unmount();context.dispatch.mockClear();
 const second=render(<LegacyForm/>);expect(second.getByText('Unsaved')).toBeTruthy();expect((second.getByLabelText('Name') as HTMLInputElement).value).toBe('Synthetic retained');
 expect(context.dispatch.mock.calls.every(([action])=>action.type!=='MARK_DIRTY'||action.dirty)).toBe(true);
 fireEvent.click(second.getByText('Accept save'));expect(second.getByText('Clean')).toBeTruthy();expect(context.store?.hasDraft('draft:tab:a:test-form')).toBe(false);
 second.unmount();expect(render(<LegacyForm/>).getByText('Clean')).toBeTruthy();
});
it('legacy dirty restoration is disabled in view mode',()=>{
 context.store?.writeField('draft:tab:a:test-form','name','draft');const hook=renderHook(()=>useWorkspaceFormDirty({formId:'test-form',enabled:false}));expect(hook.result.current.isDirty).toBe(false);
});
it('programmatic custom controls mark the owner dirty without native input events',()=>{
 const hook=renderHook(()=>({dirty:useWorkspaceFormDirty({formId:'test-form',enabled:true}),draft:useWorkspaceFormDraft({formId:'test-form'})}));
 expect(hook.result.current.dirty.isDirty).toBe(false);act(()=>hook.result.current.draft.writeDraftField('country_id',2));expect(hook.result.current.dirty.isDirty).toBe(true);
 act(()=>hook.result.current.draft.clearDraft());expect(hook.result.current.dirty.isDirty).toBe(false);
});
it('a forbidden custom credential/file edit never creates a dirty draft',()=>{
 const hook=renderHook(()=>({dirty:useWorkspaceFormDirty({formId:'test-form',enabled:true}),draft:useWorkspaceFormDraft({formId:'test-form'})}));
 act(()=>{hook.result.current.draft.writeDraftField('apiKey','synthetic');hook.result.current.draft.writeDraftField('attachments[0]','synthetic');});
 expect(hook.result.current.dirty.isDirty).toBe(false);expect(context.store?.getDraft(hook.result.current.draft.draftKey)).toBeUndefined();
});
it('legacy dirty restoration cannot inherit a different form or tab draft',()=>{
 context.store?.writeField('draft:tab:b:test-form','name','other tab');context.store?.writeField('draft:tab:a:other-form','name','other form');const hook=renderHook(()=>useWorkspaceFormDirty({formId:'test-form',enabled:true}));expect(hook.result.current.isDirty).toBe(false);
});
it.each(['', '0', '-1', 'bad', '1.5'])('nullable selection preserves cleared/invalid state instead of resurrecting server ID: %s',value=>{
 context.store?.writeField('draft:tab:a:test-form','country_id',value);
 const hook=renderHook(()=>useWorkspaceFormDraft({formId:'test-form'}));
 expect(hook.result.current.getDraftNullableId('country_id',7)).toBeNull();
});
it('nullable selection uses server fallback only when no draft field exists',()=>{
 const hook=renderHook(()=>useWorkspaceFormDraft({formId:'test-form'}));expect(hook.result.current.getDraftNullableId('country_id',7)).toBe(7);
});
it('captures an edit synchronously before immediate departure',()=>{const ui=render(<Form/>);fireEvent.input(ui.getByLabelText('Name'),{target:{value:'synthetic'}});ui.unmount();expect(context.store?.getDraft('draft:tab:a:test-form')).toEqual({full_name:'synthetic'});});
it('preserves an immediately cleared value without resurrection',()=>{const ui=render(<Form/>);fireEvent.input(ui.getByLabelText('Name'),{target:{value:'old'}});act(()=>vi.runAllTimers());fireEvent.input(ui.getByLabelText('Name'),{target:{value:''}});ui.unmount();expect(context.store?.getDraft('draft:tab:a:test-form')?.full_name).toBe('');});
it('binds outgoing draft to source while active navigation changes',()=>{const hook=renderHook(()=>useWorkspaceFormDraft({formId:'test-form'}));const key=hook.result.current.draftKey;context.active='b';hook.rerender();act(()=>hook.result.current.writeDraftField('full_name','source'));expect(hook.result.current.draftKey).toBe(key);expect(context.store?.getDraft('draft:tab:b:test-form')).toBeUndefined();});
it('cannot recreate a cleared draft with a pending snapshot',()=>{const ui=render(<Form/>);fireEvent.input(ui.getByLabelText('Name'),{target:{value:'discarded'}});context.store?.clearDraftsForTab('a');act(()=>vi.runAllTimers());expect(context.store?.hasDraft('draft:tab:a:test-form')).toBe(false);});
it('marks only the originating tab dirty during navigation',()=>{const hook=renderHook(()=>useWorkspaceTabDirty({isDirty:true}));context.dispatch.mockClear();context.active='b';hook.rerender();expect(context.dispatch.mock.calls.some(([action])=>action.tabId==='b')).toBe(false);});
it('captures unchecked named checkboxes explicitly',()=>{render(<form id="test-form"><input type="checkbox" name="active" defaultChecked={false}/></form>);expect(snapshotFormData('test-form')).toEqual({active:'false'});});
it('excludes a password input even under an innocent field name',()=>{render(<form id="test-form"><input name="value" type="password" defaultValue="synthetic-never-store"/></form>);expect(snapshotFormData('test-form')).toEqual({});});
it('retains controlled fields absent from the mounted section',()=>{context.store?.writeField('draft:tab:a:test-form','cb_company','1');const ui=render(<Form/>);fireEvent.input(ui.getByLabelText('Name'),{target:{value:'safe'}});act(()=>vi.runAllTimers());expect(context.store?.getDraft('draft:tab:a:test-form')).toEqual({cb_company:'1',full_name:'safe'});});
it('keeps different provider stores isolated',()=>{const other=createWorkspaceDraftStore();context.store?.writeField('same','full_name','A');expect(other.getDraft('same')).toBeUndefined();});
