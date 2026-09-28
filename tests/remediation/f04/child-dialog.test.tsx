// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ERPChildDialogForm } from '@/components/erp/erp-child-dialog-form';
const error=vi.hoisted(()=>vi.fn());
vi.mock('sonner',()=>({toast:{error}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const child=(props:Partial<React.ComponentProps<typeof ERPChildDialogForm>>={})=>render(<ERPChildDialogForm open title="Synthetic child" onOpenChange={()=>{}} {...props}><label htmlFor="child-name">Full name</label><input id="child-name" required/><label htmlFor="child-email">Email</label><input id="child-email" type="email"/></ERPChildDialogForm>);
it('validates unwrapped native controls and focuses the first invalid field before submitting',()=>{
 const save=vi.fn();const ui=child({onSubmit:save});fireEvent.click(ui.getByRole('button',{name:'Add'}));expect(save).not.toHaveBeenCalled();expect(document.activeElement).toBe(ui.getByLabelText('Full name'));expect(ui.getByRole('alert').textContent).toContain('This field is required.');
});
it('invalid private email never appears in shared validation summary',()=>{
 const save=vi.fn();const ui=child({onSubmit:save});fireEvent.change(ui.getByLabelText('Full name'),{target:{value:'Synthetic'}});fireEvent.change(ui.getByLabelText('Email'),{target:{value:'PRIVATE_EMAIL_INVALID'}});fireEvent.click(ui.getByRole('button',{name:'Add'}));expect(save).not.toHaveBeenCalled();expect(ui.getByRole('alert').textContent).not.toContain('PRIVATE_EMAIL_INVALID');expect(document.activeElement).toBe(ui.getByLabelText('Email'));
});
it('coalesces rapid saves and blocks cancellation until the pending callback resolves',async()=>{
 let resolve!:()=>void;const save=vi.fn(()=>new Promise<void>(r=>{resolve=r;}));const close=vi.fn();const ui=child({onSubmit:save,onOpenChange:close});fireEvent.change(ui.getByLabelText('Full name'),{target:{value:'Synthetic'}});
 const button=ui.getByRole('button',{name:'Add'});fireEvent.click(button);fireEvent.click(button);fireEvent.click(ui.getByRole('button',{name:'Cancel'}));expect(save).toHaveBeenCalledTimes(1);expect(close).not.toHaveBeenCalled();expect((button as HTMLButtonElement).disabled).toBe(true);
 await act(async()=>resolve());expect((button as HTMLButtonElement).disabled).toBe(false);
});
it('a rejected request retains the values and admits a deliberate retry',async()=>{
 const save=vi.fn().mockRejectedValueOnce(Error('private provider detail')).mockResolvedValueOnce(undefined);const ui=child({onSubmit:save});fireEvent.change(ui.getByLabelText('Full name'),{target:{value:'Synthetic retained'}});fireEvent.click(ui.getByRole('button',{name:'Add'}));await waitFor(()=>expect(error).toHaveBeenCalled());expect(error.mock.calls[0][0]).not.toContain('private provider detail');expect((ui.getByLabelText('Full name') as HTMLInputElement).value).toBe('Synthetic retained');fireEvent.click(ui.getByRole('button',{name:'Add'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));
});
it('Cancel offers stay or explicit discard after a native edit',()=>{
 const close=vi.fn(),cancel=vi.fn();const ui=child({onOpenChange:close,onCancel:cancel});fireEvent.change(ui.getByLabelText('Full name'),{target:{value:'Retain'}});fireEvent.click(ui.getByRole('button',{name:'Cancel'}));expect(close).not.toHaveBeenCalled();fireEvent.click(ui.getByRole('button',{name:'Keep editing'}));expect((ui.getByLabelText('Full name') as HTMLInputElement).value).toBe('Retain');fireEvent.click(ui.getByRole('button',{name:'Cancel'}));fireEvent.click(ui.getByRole('button',{name:'Discard changes'}));expect(cancel).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledWith(false);
});
it('controlled custom dirty state warns without a native change event',()=>{
 const close=vi.fn();const ui=child({isDirty:true,onOpenChange:close});fireEvent.click(ui.getByRole('button',{name:'Close',exact:true}));expect(close).not.toHaveBeenCalled();expect(ui.getByRole('button',{name:'Keep editing'})).toBeTruthy();
});
it('meaningfully reverted controlled inputs close without a false dirty warning',()=>{
 const close=vi.fn();const ui=child({isDirty:false,onOpenChange:close});fireEvent.change(ui.getByLabelText('Full name'),{target:{value:'Then reverted'}});fireEvent.click(ui.getByRole('button',{name:'Cancel'}));expect(close).toHaveBeenCalledWith(false);
});
it('native reload listener is active for editable child and removed when it unmounts',()=>{
 const ui=child();const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);ui.unmount();const after=new Event('beforeunload',{cancelable:true});window.dispatchEvent(after);expect(after.defaultPrevented).toBe(false);
});
it('read-only view does not acquire an unsaved reload warning',()=>{
 child({mode:'view'});const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);
});
