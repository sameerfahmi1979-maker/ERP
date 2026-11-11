// @vitest-environment jsdom
import {act,cleanup,render,screen,fireEvent} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ComponentProps} from 'react';
const m=vi.hoisted(()=>({preview:vi.fn()}));
vi.mock('@/server/actions/dms/standard-file-name',()=>({previewDmsStandardFileName:m.preview}));
import {DmsStandardFileNameField} from '@/features/dms/intake/dms-standard-file-name-field';
type Props=ComponentProps<typeof DmsStandardFileNameField>;
const props={savedDocument:true,session:{id:53,original_filename:'Original.pdf',ai_result:null},values:{documentTypeId:1,standardFileName:'Original.pdf',metadataValues:{},expiryDate:'',description:'',title:'Synthetic'},docTypes:[{id:1,type_code:'SYN',requires_expiry_tracking:false}],onChange:vi.fn()} as unknown as Props;
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();m.preview.mockResolvedValue({success:true,data:{fileName:'Reviewed_certificate.pdf',validation:{missing:[]}}});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('keeps the stored file extension in the real filename widget used by saved intake',async()=>{
 render(<DmsStandardFileNameField {...props}/>);
 await act(()=>vi.advanceTimersByTimeAsync(350));
 expect(props.onChange).toHaveBeenCalledWith({standardFileName:'Reviewed_certificate.pdf'});
 expect(m.preview.mock.calls[0][0].uploadSessionId).toBeUndefined();
});
it('preserves the original fresh-upload base-name contract',async()=>{
 render(<DmsStandardFileNameField {...props} savedDocument={false}/>);
 await act(()=>vi.advanceTimersByTimeAsync(350));
 expect(props.onChange).toHaveBeenCalledWith({standardFileName:'Reviewed_certificate'});
});
it('does not overwrite a manual filename when an earlier suggestion resolves',async()=>{
 let resolve!:(v:unknown)=>void;m.preview.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 render(<DmsStandardFileNameField {...props}/>);await act(()=>vi.advanceTimersByTimeAsync(350));
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Manual.pdf'}});
 await act(async()=>resolve({success:true,data:{fileName:'Stale.pdf',validation:{missing:[]}}}));
 expect(props.onChange).toHaveBeenCalledTimes(1);expect(props.onChange).toHaveBeenCalledWith({standardFileName:'Manual.pdf'});
});
it('ignores a suggestion that finishes after closing the form',async()=>{
 let resolve!:(v:unknown)=>void;m.preview.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const view=render(<DmsStandardFileNameField {...props}/>);await act(()=>vi.advanceTimersByTimeAsync(350));view.unmount();
 await act(async()=>resolve({success:true,data:{fileName:'Late.pdf',validation:{missing:[]}}}));
 expect(props.onChange).not.toHaveBeenCalled();
});
