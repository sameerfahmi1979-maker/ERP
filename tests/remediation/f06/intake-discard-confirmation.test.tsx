// @vitest-environment jsdom
import {useState} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {DmsIntakeDiscardConfirmation} from '@/features/dms/intake/dms-intake-discard-confirmation';
afterEach(cleanup);
function Fixture({confirm,pending=false}:{confirm:()=>void;pending?:boolean}){
 const [anchor,setAnchor]=useState<'header'|'footer'|null>(null);
 const [reason,setReason]=useState('');
 return <>{(['header','footer'] as const).map(placement=><DmsIntakeDiscardConfirmation key={placement} placement={placement}
  open={anchor===placement} onOpenChange={open=>setAnchor(open?placement:null)} disabled={false} pending={pending}
  hasDraftDocument={false} canSaveDraft reason={reason} onReasonChange={setReason} onConfirm={confirm}/>)}</>;
}
it.each(['Discard','Discard Intake'])('opening %s requires explicit confirmation; cancelling leaves the intake untouched',async label=>{
 const confirm=vi.fn();render(<Fixture confirm={confirm}/>);
 fireEvent.click(screen.getByRole('button',{name:label,exact:true}));
 const dialog=await screen.findByRole('dialog',{name:'Discard this intake?'});
 expect(dialog.textContent).toContain('Save Draft');expect(confirm).not.toHaveBeenCalled();
 await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:'Cancel',exact:true})));
 fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(confirm).not.toHaveBeenCalled();
});
it('retains an optional reason across dismissal and confirms only from the popup',async()=>{
 const confirm=vi.fn();render(<Fixture confirm={confirm}/>);
 fireEvent.click(screen.getByRole('button',{name:'Discard Intake',exact:true}));
 fireEvent.change(await screen.findByLabelText('Reason (optional)'),{target:{value:'Synthetic duplicate'}});
 fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 fireEvent.click(screen.getByRole('button',{name:'Discard',exact:true}));
 expect((await screen.findByLabelText('Reason (optional)') as HTMLInputElement).value).toBe('Synthetic duplicate');
 fireEvent.click(screen.getByRole('button',{name:'Confirm Discard',exact:true}));expect(confirm).toHaveBeenCalledTimes(1);
});
it('keeps an in-flight discard visible and prevents another confirmation or reason change',async()=>{
 const confirm=vi.fn();const view=render(<Fixture confirm={confirm}/>);
 fireEvent.click(screen.getByRole('button',{name:'Discard Intake',exact:true}));await screen.findByRole('dialog');
 view.rerender(<Fixture confirm={confirm} pending/>);
 expect((screen.getByLabelText('Reason (optional)') as HTMLInputElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Discarding…'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
 expect(screen.getByRole('dialog')).toBeTruthy();expect(confirm).not.toHaveBeenCalled();
});
