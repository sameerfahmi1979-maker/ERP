// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {api,hash,view,ready,setup,values} from './saved-intake-harness';
import {missingSavedIntakeFields} from '@/lib/dms/saved-intake';
const fields=[{id:4,code:'certificate_number',label:'Certificate Number',type:'text',current:null,required:true,aiExtractable:true}];
beforeEach(()=>{setup();api.realDialog=true;api.schema.mockResolvedValue({success:true,data:{schemaHash:hash,fields}});});
afterEach(cleanup);
it('names missing metadata before saving, keeps edits and navigates to the field',async()=>{
 render(view());await ready();fireEvent.click(screen.getAllByText('Update & Save')[0]);await ready();
 expect(api.save).not.toHaveBeenCalled();expect(screen.queryByText('Confirm update')).toBeNull();
 const link=screen.getByRole('button',{name:'Certificate Number: This field is required.'});fireEvent.click(link);
 expect(document.activeElement).toBe(screen.getByLabelText('Certificate Number'));
 expect(screen.getByLabelText('Certificate Number').getAttribute('aria-invalid')).toBe('true');
 fireEvent.click(screen.getByText('Close intake'));expect(screen.getByText('Your entries in this dialog have not been saved.')).toBeTruthy();
 fireEvent.click(screen.getByText('Keep editing'));expect(screen.getByLabelText('Title')).toBeTruthy();
});
it('saves directly even when an earlier close attempt opened the discard warning',async()=>{
 render(view());await ready();
 fireEvent.change(screen.getByLabelText('Certificate Number'),{target:{value:'SYN-CERT-123'}});
 fireEvent.click(screen.getByText('Close intake'));
 expect(screen.getByText('Your entries in this dialog have not been saved.')).toBeTruthy();
 fireEvent.click(screen.getAllByRole('button',{name:'Update & Save'})[0]);
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(api.save).toHaveBeenCalledOnce();expect(api.success).toHaveBeenCalledWith('Document updated successfully.');
 expect(screen.queryByText('Confirm update')).toBeNull();
 expect(screen.queryByText('Your entries in this dialog have not been saved.')).toBeNull();
});
it('the footer Update & Save also commits in one click and closes',async()=>{
 render(view());await ready();
 fireEvent.change(screen.getByLabelText('Certificate Number'),{target:{value:'SYN-CERT-123'}});
 const buttons=screen.getAllByRole('button',{name:'Update & Save'});
 fireEvent.click(buttons[buttons.length-1]);
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(api.save).toHaveBeenCalledOnce();expect(api.save.mock.calls[0][1]).toBe(false);
 expect(screen.queryByText('Keep reviewing')).toBeNull();
});
it('closes the real guarded dialog after correcting and successfully updating',async()=>{
 render(view());await ready();fireEvent.click(screen.getAllByText('Update & Save')[0]);await ready();
 fireEvent.change(screen.getByLabelText('Certificate Number'),{target:{value:'SYN-CERT-123'}});
 fireEvent.click(screen.getAllByText('Update & Save')[0]);
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(api.save).toHaveBeenCalledOnce();expect(api.success).toHaveBeenCalledWith('Document updated successfully.');
 expect(screen.queryByText('Your entries in this dialog have not been saved.')).toBeNull();
});
it('retains the close guard and entered values after a definitive save rejection',async()=>{
 api.save.mockResolvedValue({success:false,error:'Document was not updated.'});render(view());await ready();
 fireEvent.change(screen.getByLabelText('Certificate Number'),{target:{value:'SYN-CERT-123'}});
 fireEvent.click(screen.getAllByText('Update & Save')[0]);
 await screen.findByText('Document was not updated.');fireEvent.click(screen.getByText('Close intake'));
 expect(screen.getByText('Your entries in this dialog have not been saved.')).toBeTruthy();
 expect((screen.getByLabelText('Certificate Number') as HTMLInputElement).value).toBe('SYN-CERT-123');expect(api.success).not.toHaveBeenCalled();
});
it('allows an incomplete review draft to be retained without applying the document',async()=>{
 render(view());await ready();fireEvent.click(screen.getAllByText('Save Draft')[0]);await screen.findByText('Draft saved. The existing document has not been updated.');
 expect(api.save.mock.calls[0][1]).toBe(true);fireEvent.click(screen.getByText('Close intake'));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(screen.queryByText('Your entries in this dialog have not been saved.')).toBeNull();
});
it('treats whitespace as missing, but preserves false/zero and optional empty values',()=>{
 expect(missingSavedIntakeFields({...values,metadataValues:{4:{fieldType:'text',rawValue:'  '}}},fields)).toHaveLength(1);
 for(const rawValue of ['false','0'])expect(missingSavedIntakeFields({...values,metadataValues:{4:{fieldType:'text',rawValue}}},fields)).toHaveLength(0);
 expect(missingSavedIntakeFields(values,fields.map(f=>({...f,required:false})))).toHaveLength(0);
});
