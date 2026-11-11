// @vitest-environment jsdom
import{afterEach,beforeEach,expect,it,vi}from'vitest';import{act,cleanup,fireEvent,render,screen,waitFor}from'@testing-library/react';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
const m=vi.hoisted(()=>({read:vi.fn(),active:true}));vi.mock('@/server/actions/hr/subject-photo',()=>({readSubjectPhotos:m.read}));vi.mock('@/hooks/use-read-lifetime',()=>({useReadLifetime:()=>({get active(){return m.active;},get enabled(){return m.active;}})}));
const photoState=vi.hoisted(()=>({read:vi.fn()}));vi.mock('@/server/actions/hr/photo-controls',()=>({readSavedSubjectPhoto:photoState.read,readPhotoDocumentTypes:vi.fn(),readPhotoFramingSource:vi.fn()}));
vi.mock('@/components/erp/combobox',()=>({ERPCombobox:({ariaLabel,value,options,disabled,onValueChange}:{ariaLabel:string;value:number|null;options:Array<{value:number;label:string}>;disabled:boolean;onValueChange:(v:string)=>void})=><select aria-label={ariaLabel}value={value??''}disabled={disabled}onChange={e=>onValueChange(e.target.value)}><option value="">Choose</option>{options.map(o=><option key={o.value}value={o.value}>{o.label}</option>)}</select>}));
import{SubjectPhoto,SubjectPhotoReadOnly}from'@/features/hr/employees/subject-photo';
import type {SubjectPhotoDraft} from '@/features/hr/employees/use-subject-photo-draft';
let qc:QueryClient;const row={document_id:2,version_id:3,file_id:4,label:'DMS-SYN-2'};
beforeEach(()=>{vi.resetAllMocks();m.active=true;qc=new QueryClient({defaultOptions:{queries:{retry:false}}});m.read.mockResolvedValue({success:true,rows:[row],hasMore:false});photoState.read.mockResolvedValue({success:true,documentId:2,framing:null,canDownload:true});});afterEach(()=>{cleanup();qc.clear();});
const base={employee:1,identity:'actor-company-scope',value:null as number|null,disabled:false};
it('dependent cards request private photo details only after the user opens them',async()=>{render(<QueryClientProvider client={qc}><SubjectPhotoReadOnly employee={1} dependent={3} subject="dependent" identity="actor-company-scope"/></QueryClientProvider>);expect(photoState.read).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'View photo'}));await screen.findByRole('link',{name:'Download saved photo'});expect(photoState.read).toHaveBeenCalledWith({employee:1,dependent:3});fireEvent.click(screen.getByRole('button',{name:'Hide photo'}));expect(screen.queryByRole('img')).toBeNull();});
it('read-only people have separately authorized saved and original downloads',async()=>{mount({value:2,dependent:3,subject:'dependent',disabled:true});const saved=await screen.findByRole('link',{name:'Download saved photo'});expect(saved.getAttribute('href')).toContain('dependent=3&mode=download');expect(screen.getByRole('link',{name:'Download original'}).getAttribute('href')).toContain('mode=original');expect(screen.queryByRole('button',{name:/Remove photo from/})).toBeNull();expect(screen.queryByRole('button',{name:'Adjust photo framing'})).toBeNull();});
it('preview permission without download authority never presents a download',async()=>{photoState.read.mockResolvedValue({success:true,documentId:2,canDownload:false});mount({value:2,disabled:true});await screen.findByRole('img');await waitFor(()=>expect(photoState.read).toHaveBeenCalled());expect(screen.queryByRole('link')).toBeNull();});
function mount(p:Partial<React.ComponentProps<typeof SubjectPhoto>>={}){const change=vi.fn();const view=render(<QueryClientProvider client={qc}><SubjectPhoto {...base}{...p}onValue={change}/></QueryClientProvider>);return{change,...view};}
it.each(['employee','dependent'] as const)('%s photo uploads have no document-type selector',async subject=>{const draft={local:{url:'blob:synthetic-photo'},retained:null,busy:false,blocked:false,typeId:53,requiresExpiry:false,details:null,choose:vi.fn(),discard:vi.fn()} as unknown as SubjectPhotoDraft;mount({draft,subject,...(subject==='dependent'?{dependent:3}:{})});await screen.findByLabelText('Upload photo');expect(screen.queryByLabelText('Photo document type')).toBeNull();expect(screen.queryByText('Photo document expiry')).toBeNull();});
it('photo selection is explicit and belongs to the existing form, not a second save',async()=>{const{change}=mount();await screen.findByText(row.label);expect(change).not.toHaveBeenCalled();fireEvent.change(screen.getByLabelText('Employee photo'),{target:{value:'2'}});expect(change).toHaveBeenCalledWith(2);});
it('private preview has no public URL and explicit removal does not delete files',async()=>{const{change}=mount({value:2});const img=await screen.findByRole('img'),url=new URL(img.getAttribute('src')!,window.location.origin);expect(url.origin).toBe(window.location.origin);expect(url.pathname+url.search).toBe('/api/dms/file?fileId=4&disposition=inline');fireEvent.change(screen.getByLabelText('Employee photo'),{target:{value:''}});expect(change).toHaveBeenCalledWith(null);});
it('unavailable choices keep the saved reference and never guess or clear it',async()=>{m.read.mockResolvedValue({success:false,error:'Restricted'});const{change}=mount({value:9});await screen.findByRole('alert');expect(screen.getByText(/Recorded photo #9/)).toBeTruthy();expect(change).not.toHaveBeenCalled();expect(screen.queryByRole('img')).toBeNull();});
it('failed revalidation withdraws retained preview data',async()=>{mount({value:2});await screen.findByRole('img');m.read.mockResolvedValue({success:false,error:'Revoked'});fireEvent.click(screen.getByRole('button',{name:'Refresh available photos'}));await screen.findByRole('alert');expect(screen.queryByRole('img')).toBeNull();});
it('unsaved dependent is labelled correctly and never dispatches a photo read',()=>{mount({employee:null,dependent:null,subject:'dependent'});expect(screen.getByText('Dependent photo')).toBeTruthy();expect(screen.getByText(/Save the person first/)).toBeTruthy();expect(m.read).not.toHaveBeenCalled();});
it('a late retired identity response cannot reveal a photo',async()=>{let finish!:(v:unknown)=>void;m.read.mockReturnValue(new Promise(r=>{finish=r;}));const{change}=mount({value:2});await waitFor(()=>expect(m.read).toHaveBeenCalled());m.active=false;finish({success:true,rows:[row],hasMore:false});await waitFor(()=>expect(screen.queryByRole('img')).toBeNull());expect(change).not.toHaveBeenCalled();});

it.each(['employee','dependent'] as const)('%s photo actions are named icon controls and preserve download targets',async subject=>{
 mount({value:2,subject,...(subject==='dependent'?{dependent:3}:{}),onFraming:vi.fn()});
 const download=await screen.findByRole('link',{name:'Download saved photo'});
 expect(download.querySelector('svg')).not.toBeNull();expect(download.textContent).toBe('');
 expect(download.getAttribute('href')).toBe('/api/hr/subject-photo?employee=1'+(subject==='dependent'?'&dependent=3':'')+'&mode=download');
 for(const label of ['Adjust photo framing','Remove photo from '+subject,'Refresh available photos']){
  const button=screen.getByRole('button',{name:label});expect(button.querySelector('svg')).not.toBeNull();expect(button.textContent).toBe('');expect(button.getAttribute('type')).toBe('button');
 }
});
it('icon description appears on keyboard focus',async()=>{
 mount({value:2});const link=await screen.findByRole('link',{name:'Download saved photo'});
 act(()=>link.focus());
 const tooltip=await screen.findByText('Download saved photo',{exact:true});expect(tooltip.getAttribute('data-slot')).toBe('tooltip-content');
});
it.each(['employee','dependent'] as const)('%s removal requires confirmation and only clears the form selection',async subject=>{
 const framing=vi.fn();const {change}=mount({value:2,subject,...(subject==='dependent'?{dependent:3}:{}),onFraming:framing});
 await screen.findByRole('img');fireEvent.click(screen.getByRole('button',{name:'Remove photo from '+subject}));
 expect(change).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Keep photo'}));expect(change).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Remove photo from '+subject}));fireEvent.click(screen.getByRole('button',{name:'Remove photo',exact:true}));
 expect(change).toHaveBeenCalledWith(null);expect(framing).toHaveBeenCalledWith('',false);expect(screen.queryByText('Remove this photo from the form? Its original document will be kept.')).toBeNull();
});

it('icon description appears on pointer hover',async()=>{
 mount({value:2});const link=await screen.findByRole('link',{name:'Download original'});
 fireEvent.mouseEnter(link);fireEvent.mouseMove(link);
 const tooltip=await screen.findByText('Download original',{exact:true});expect(tooltip.getAttribute('data-slot')).toBe('tooltip-content');
});
