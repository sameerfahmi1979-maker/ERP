// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('next/navigation',()=>({usePathname:()=>'/test'}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>null}));
import { ERPRecordSectionPanel, ERPRecordWorkspaceForm } from '@/components/workspace/erp-record-workspace-form';
import { collectWorkspaceFieldIssues } from '@/lib/workspace/form-validation';
import { reportWorkspaceFieldErrors, workspaceValidationFailure } from '@/lib/workspace/field-errors';
afterEach(cleanup);
function Form({save,child=false}:{save:()=>Promise<void>|void;child?:boolean}) {
 const [section,setSection]=useState('basic');
 return <ERPRecordWorkspaceForm title="Synthetic" mode="add" isDirty sections={[{id:'basic',label:'Basic'},{id:'contact',label:'Contact'}]} activeSection={section} onSectionChange={setSection} onSave={save} onSaveAndClose={save} isChildDialogOpen={child}>
  <form id="validation-test" onSubmit={e=>{e.preventDefault();save();}}>
   <ERPRecordSectionPanel id="basic" activeId={section}><label htmlFor="name">Name</label><input id="name" name="name" required defaultValue="Synthetic"/></ERPRecordSectionPanel>
   <ERPRecordSectionPanel id="contact" activeId={section}><label htmlFor="email">Email</label><input id="email" name="email" type="email" required aria-describedby="hint"/><span id="hint">Business email</span></ERPRecordSectionPanel>
  </form>
 </ERPRecordWorkspaceForm>;
}
it('Save finds hidden-section required errors, reveals the section and focuses its field',()=>{
 const save=vi.fn();const ui=render(<Form save={save}/>);fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));expect(save).not.toHaveBeenCalled();expect(ui.getByRole('alert').textContent).toContain('Email');expect(document.activeElement).toBe(ui.getByLabelText('Email'));expect(ui.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');expect(ui.getByLabelText('Email').getAttribute('aria-describedby')).toContain('hint');
});
it('Save and Close validates before attempting the action and retains entered fields',()=>{
 const save=vi.fn();const ui=render(<Form save={save}/>);fireEvent.click(ui.getByRole('button',{name:'Save & Close'}));expect(save).not.toHaveBeenCalled();expect((ui.getByLabelText('Name') as HTMLInputElement).value).toBe('Synthetic');
});
it('corrected input clears error feedback and submits once',async()=>{
 const save=vi.fn();const ui=render(<Form save={save}/>);fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));fireEvent.input(ui.getByLabelText('Email'),{target:{value:'synthetic@example.invalid'}});fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));expect(ui.queryByRole('alert')).toBeNull();expect(ui.getByLabelText('Email').getAttribute('aria-describedby')).toBe('hint');
});
it('corrected errors disappear immediately without another Save or shifting typing focus',()=>{
 const save=vi.fn();const ui=render(<Form save={save}/>);fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));
 fireEvent.input(ui.getByLabelText('Email'),{target:{value:'synthetic@example.invalid'}});expect(ui.queryByRole('alert')).toBeNull();expect(document.activeElement).toBe(ui.getByLabelText('Email'));expect(ui.getByLabelText('Email').hasAttribute('aria-invalid')).toBe(false);expect(save).not.toHaveBeenCalled();
});
it('Enter submission cannot bypass invalid controls',()=>{
 const save=vi.fn();const ui=render(<Form save={save}/>);fireEvent.submit(ui.container.querySelector('form')!);expect(save).not.toHaveBeenCalled();expect(ui.getByRole('alert')).toBeTruthy();
});
it('pending Save blocks another Save/Enter and failure makes retry available',async()=>{
 let reject!:(e:Error)=>void;const save=vi.fn(()=>new Promise<void>((_,r)=>{reject=r;}));const ui=render(<Form save={save}/>);fireEvent.input(ui.getByLabelText('Email'),{target:{value:'synthetic@example.invalid'}});
 fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));fireEvent.submit(ui.container.querySelector('form')!);expect(save).toHaveBeenCalledTimes(1);
 await act(async()=>reject(new Error('offline')));expect((ui.getByRole('button',{name:'Save',exact:true}) as HTMLButtonElement).disabled).toBe(false);expect((ui.getByLabelText('Email') as HTMLInputElement).value).toBe('synthetic@example.invalid');
});
it('open child dialog prevents the parent save',()=>{const save=vi.fn();const ui=render(<Form save={save} child/>);fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));expect(save).not.toHaveBeenCalled();});
it('server feedback opens the field section and focuses it after the save settles',async()=>{
 const ui=render(<Form save={async()=>{reportWorkspaceFieldErrors('validation-test',{email:'Check the required value and format.'});}}/>);
 fireEvent.input(ui.getByLabelText('Email'),{target:{value:'synthetic@example.invalid'}});
 fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));
 await waitFor(()=>expect(ui.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true'));
 await waitFor(()=>expect(document.activeElement).toBe(ui.getByLabelText('Email')));expect(ui.getByRole('alert').textContent).toContain('Email');
});
it('unmapped server fields remain visible and never focus another form',()=>{
 const ui=render(<Form save={()=>{}}/>);
 act(()=>reportWorkspaceFieldErrors('validation-test',{custom_code:'Check the required value and format.'}));
 expect(ui.getByRole('alert').textContent).toContain('custom code');
 act(()=>reportWorkspaceFieldErrors('other-form',{email:'Other record'}));expect(ui.getByRole('alert').textContent).not.toContain('Other record');
});
it('schema feedback never serializes submitted values or raw schema diagnostics',()=>{
 const r=workspaceValidationFailure([{path:['email']},{path:['email']},{path:[]}]);
 expect(r).toEqual({success:false,error:'Check the highlighted fields before saving.',fieldErrors:{email:'Check the required value and format.'}});
});
it('ignores disabled fields; rejects number boundaries and invalid emails without exposing entered values in the summary',()=>{
 const ui=render(<form><input name="ignored" disabled required/><input name="latitude" type="number" max="90" defaultValue="91"/><input name="email" type="email" defaultValue="PRIVATE-INVALID"/></form>);
 const issues=collectWorkspaceFieldIssues(ui.container.querySelector('form')!);expect(issues.map(i=>i.label)).toEqual(['latitude','email']);expect(issues.map(i=>i.message).join()).not.toContain('PRIVATE-INVALID');
});
