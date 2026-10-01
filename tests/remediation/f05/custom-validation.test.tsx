// @vitest-environment jsdom
import './setup';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('next/navigation',()=>({usePathname:()=>'/test'}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>null}));
import { ERPRecordWorkspaceForm } from '@/components/workspace/erp-record-workspace-form';
import { ERPChildDialogForm } from '@/components/erp/erp-child-dialog-form';
import { WORKSPACE_FIELD_ERRORS_EVENT } from '@/lib/workspace/field-errors';
afterEach(cleanup);
function Custom(){const [chosen,setChosen]=useState(false);const root=useRef<HTMLDivElement>(null);return <div ref={root}><button type="button" aria-label="Company" data-workspace-field="company_id" data-workspace-required="true" data-workspace-empty={chosen?'false':'true'} onClick={()=>{setChosen(true);root.current?.dispatchEvent(new Event('change',{bubbles:true}));}}>Select</button></div>;}
it('custom native change signals clear record feedback after controlled state commits',async()=>{
 const save=vi.fn();const ui=render(<ERPRecordWorkspaceForm title="Synthetic" mode="add" isDirty sections={[]} activeSection="basic" onSectionChange={()=>{}} onSave={save}><form><Custom/></form></ERPRecordWorkspaceForm>);
 fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));expect(ui.getByRole('alert').textContent).toContain('Company');expect(save).not.toHaveBeenCalled();fireEvent.click(ui.getByRole('button',{name:'Company',exact:true}));await waitFor(()=>{expect(ui.queryByRole('alert')).toBeNull();expect(ui.getByRole('button',{name:'Company',exact:true}).hasAttribute('aria-describedby')).toBe(false);});
});
it('custom change clears child errors and preserves explicit discard guard',async()=>{
 const close=vi.fn();const ui=render(<ERPChildDialogForm open title="Synthetic" onOpenChange={close} onSubmit={()=>{}}><Custom/></ERPChildDialogForm>);
 fireEvent.click(ui.getByRole('button',{name:'Add',exact:true}));expect(ui.getByRole('alert').textContent).toContain('Company');fireEvent.click(ui.getByRole('button',{name:'Company',exact:true}));await waitFor(()=>expect(ui.queryByRole('alert')).toBeNull());fireEvent.click(ui.getByRole('button',{name:'Cancel',exact:true}));expect(close).not.toHaveBeenCalled();expect(ui.getByRole('button',{name:'Discard changes'})).toBeTruthy();
});
it('outer-form record adapters receive required summaries and clear custom/native feedback',async()=>{
 const save=vi.fn();const ui=render(<form><ERPRecordWorkspaceForm title="Synthetic outer form" mode="add" isDirty sections={[]} activeSection="basic" onSectionChange={()=>{}} onSave={save}><input aria-label="Title" name="title" required/><Custom/></ERPRecordWorkspaceForm></form>);
 fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));expect(ui.getByRole('alert').textContent).toContain('Check 2 fields');expect(save).not.toHaveBeenCalled();fireEvent.change(ui.getByLabelText('Title'),{target:{value:'Synthetic'}});fireEvent.click(ui.getByRole('button',{name:'Company',exact:true}));await waitFor(()=>expect(ui.queryByRole('alert')).toBeNull());fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));expect(save).toHaveBeenCalledOnce();
});
it('outer-form server validation event reaches the shared summary',async()=>{
 const ui=render(<form><ERPRecordWorkspaceForm title="Synthetic outer form" mode="add" sections={[]} activeSection="basic" onSectionChange={()=>{}}><input aria-label="Title" name="title"/></ERPRecordWorkspaceForm></form>);
 fireEvent(ui.container.querySelector('form')!,new CustomEvent(WORKSPACE_FIELD_ERRORS_EVENT,{bubbles:true,detail:{title:'Choose a unique title.'}}));await waitFor(()=>expect(ui.getByRole('alert').textContent).toContain('Choose a unique title.'));
});
