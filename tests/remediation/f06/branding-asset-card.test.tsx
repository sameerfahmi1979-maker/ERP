// @vitest-environment jsdom
import '../f05/setup';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
const m=vi.hoisted(()=>({upload:vi.fn(),remove:vi.fn(),lock:vi.fn(),toast:vi.fn()}));
vi.mock('@/server/actions/branding/assets',()=>({uploadBrandingAsset:m.upload,deactivateBrandingAsset:m.remove}));
vi.mock('@/hooks/use-workspace-navigation-lock',()=>({useWorkspaceNavigationLock:m.lock}));
vi.mock('sonner',()=>({toast:{success:m.toast}}));
import {BrandingAssetUploadCard} from '@/features/branding/branding-asset-upload-card';
const props={label:'Report Logo',description:'Synthetic test',scope:'report' as const,brandingProfileId:1,ownerCompanyId:1,assetType:'report_logo' as const,asset:null,canUpload:true,parentRevision:'4'};
const view=(extra={})=><FluentProvider theme={webLightTheme}><BrandingAssetUploadCard {...props} {...extra}/></FluentProvider>;
const choose=()=>fireEvent.change(screen.getByLabelText('Choose Report Logo file'),{target:{files:[new File(['synthetic bytes'],'synthetic.png',{type:'image/png'})]}});
beforeEach(()=>{vi.resetAllMocks();m.upload.mockResolvedValue({success:false,uncertain:true,error:'Unconfirmed'});});afterEach(cleanup);
it('keeps the file and exact request identity after an uncertain result',async()=>{render(view());choose();await screen.findByRole('button',{name:'Retry unchanged asset operation'});const first=m.upload.mock.calls[0][0] as FormData;fireEvent.click(screen.getByRole('button',{name:'Retry unchanged asset operation'}));await waitFor(()=>expect(m.upload).toHaveBeenCalledTimes(2));expect(m.upload.mock.calls[1][0].get('contract')).toBe(first.get('contract'));expect(m.upload.mock.calls[1][0].get('file')).toBe(first.get('file'));expect(m.lock).toHaveBeenLastCalledWith(true);});
it('an external parent revision refresh cannot discard an unconfirmed upload',async()=>{const v=render(view());choose();await screen.findByRole('button',{name:'Retry unchanged asset operation'});const first=m.upload.mock.calls[0][0] as FormData;v.rerender(view({parentRevision:'9'}));expect(screen.getByRole('button',{name:'Retry unchanged asset operation'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Retry unchanged asset operation'}));await waitFor(()=>expect(m.upload).toHaveBeenCalledTimes(2));expect(m.upload.mock.calls[1][0].get('contract')).toBe(first.get('contract'));});
it('missing parent revision does not permit upload',()=>{render(view({parentRevision:undefined}));expect(screen.getByRole('button',{name:'Upload Report Logo'}).hasAttribute('disabled')).toBe(true);expect(screen.getByRole('alert').textContent).toMatch(/current version/);});
it('rejects SVG before calling the server',()=>{render(view());fireEvent.change(screen.getByLabelText('Choose Report Logo file'),{target:{files:[new File(['<svg/>'],'synthetic.svg',{type:'image/svg+xml'})]}});expect(m.upload).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toMatch(/Convert SVG/);});
it('a certain rejection unlocks file selection without a misleading retry',async()=>{m.upload.mockResolvedValue({success:false,error:'Rejected'});render(view());choose();await screen.findByRole('alert');await waitFor(()=>{expect(screen.queryByRole('button',{name:'Retry unchanged asset operation'})).toBeNull();expect(screen.getByRole('button',{name:'Upload Report Logo'}).hasAttribute('disabled')).toBe(false);});});
const savedAsset={id:8,workspaceRevision:'1',versionNo:1,updatedAt:'2026-10-03T00:00:00Z'};
for(const kind of ['upload','deactivate'])it(`synchronous parent admission retirement prevents ${kind} dispatch`,async()=>{
 const changed=vi.fn();
 const parent=vi.fn((pending:boolean)=>{if(pending)mounted.unmount();});
 const mounted=render(view({asset:kind==='deactivate'?savedAsset:null,onPendingChange:parent,onChanged:changed}));
 if(kind==='upload')choose();else{fireEvent.click(screen.getByRole('button',{name:'Deactivate Report Logo'}));fireEvent.click(await screen.findByRole('button',{name:'Deactivate'}));}
 await act(async()=>{});expect(m.upload).not.toHaveBeenCalled();expect(m.remove).not.toHaveBeenCalled();expect(parent.mock.calls).toEqual([[true]]);expect(changed).not.toHaveBeenCalled();expect(m.toast).not.toHaveBeenCalled();
});
it('no-op confirmation survives parent-release failure without inventing a refresh lock',async()=>{
 const parent=vi.fn((pending:boolean)=>{if(!pending)throw Error('PRIVATE PARENT');}),changed=vi.fn();m.upload.mockResolvedValue({success:true,data:{id:8,revision:'1',parent_revision:'4',changed:false,replayed:true}});render(view({onPendingChange:parent,onChanged:changed}));choose();await waitFor(()=>expect(changed).toHaveBeenCalledOnce());expect(m.toast).toHaveBeenCalledWith('No asset change was needed');expect(screen.queryByRole('button',{name:'Retry unchanged asset operation'})).toBeNull();expect(screen.queryByText(/Saved. Refreshing/)).toBeNull();expect(screen.getByRole('alert').textContent).toMatch(/Saved, but/);
});
it('an unmounted asset dispatch cannot release its old parent or display a late receipt',async()=>{
 let resolve!:(r:unknown)=>void;m.upload.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const changed=vi.fn(),parent=vi.fn();const v=render(view({onChanged:changed,onPendingChange:parent}));choose();await waitFor(()=>expect(m.upload).toHaveBeenCalledOnce());v.unmount();await act(async()=>resolve({success:true,data:{id:8,revision:'1',parent_revision:'5',changed:true,replayed:false}}));expect(parent.mock.calls).toEqual([[true]]);expect(changed).not.toHaveBeenCalled();expect(m.toast).not.toHaveBeenCalled();
});
it('keeps original metadata and File through unknown then known failure',async()=>{
 m.upload.mockResolvedValueOnce({success:false,uncertain:true}).mockResolvedValueOnce({success:false,error:'Rolled back'}).mockResolvedValueOnce({success:true,data:{id:8,revision:'1',parent_revision:'5',changed:true,replayed:true}});
 const v=render(view());choose();fireEvent.click(await screen.findByRole('button',{name:'Retry unchanged asset operation'}));
 await waitFor(()=>expect(m.upload).toHaveBeenCalledTimes(2));expect(screen.getByRole('alert').textContent).toMatch(/unconfirmed/i);
 v.rerender(view({ownerCompanyId:9,parentRevision:'99'}));fireEvent.click(await screen.findByRole('button',{name:'Retry unchanged asset operation'}));
 await waitFor(()=>expect(m.upload).toHaveBeenCalledTimes(3));const first=m.upload.mock.calls[0][0] as FormData,last=m.upload.mock.calls[2][0] as FormData;
 for(const key of ['metadata','contract','file'])expect(last.get(key)).toBe(first.get(key));
});
it('a notification failure does not skip the confirmed asset callback',async()=>{
 const changed=vi.fn();m.toast.mockImplementation(()=>{throw Error('PRIVATE TOAST');});m.upload.mockResolvedValue({success:true,data:{id:8,revision:'1',parent_revision:'5',changed:true,replayed:false}});
 render(view({onChanged:changed}));choose();await waitFor(()=>expect(changed).toHaveBeenCalledOnce());expect(screen.queryByRole('button',{name:'Retry unchanged asset operation'})).toBeNull();expect(screen.getByRole('alert').textContent).toMatch(/Saved/);
});
it('once an upload is reconciled, a later parent edit does not revive the old refresh lock',async()=>{
 m.upload.mockResolvedValue({success:true,data:{id:8,revision:'1',parent_revision:'5',changed:true,replayed:false}});
 const v=render(view());choose();await waitFor(()=>expect(m.toast).toHaveBeenCalled());
 expect(screen.getByRole('button',{name:'Upload Report Logo'}).hasAttribute('disabled')).toBe(true);
 v.rerender(view({parentRevision:'5',asset:savedAsset}));await waitFor(()=>expect(screen.getByRole('button',{name:'Replace Report Logo'}).hasAttribute('disabled')).toBe(false));
 v.rerender(view({parentRevision:'6',asset:savedAsset}));expect(screen.getByRole('button',{name:'Deactivate Report Logo'}).hasAttribute('disabled')).toBe(false);
 expect(screen.queryByText(/Saved. Refreshing/)).toBeNull();expect(m.upload).toHaveBeenCalledOnce();
});
it('a reconciled deactivation likewise allows later parent edits without locking a new upload',async()=>{
 m.remove.mockResolvedValue({success:true,data:{id:8,revision:'2',parent_revision:'5',changed:true,replayed:false}});
 const v=render(view({asset:savedAsset}));fireEvent.click(screen.getByRole('button',{name:'Deactivate Report Logo'}));fireEvent.click(await screen.findByRole('button',{name:'Deactivate'}));await waitFor(()=>expect(m.toast).toHaveBeenCalled());
 v.rerender(view({parentRevision:'5',asset:null}));await waitFor(()=>expect(screen.getByRole('button',{name:'Upload Report Logo'}).hasAttribute('disabled')).toBe(false));
 v.rerender(view({parentRevision:'6',asset:null}));expect(screen.getByRole('button',{name:'Upload Report Logo'}).hasAttribute('disabled')).toBe(false);expect(m.remove).toHaveBeenCalledOnce();
});
it('a partial refresh cannot unlock a confirmed upload before its exact version appears',async()=>{
 m.upload.mockResolvedValue({success:true,data:{id:8,revision:'1',parent_revision:'5',changed:true,replayed:false}});
 const v=render(view());choose();await waitFor(()=>expect(m.toast).toHaveBeenCalled());
 v.rerender(view({parentRevision:'5',asset:{...savedAsset,workspaceRevision:'9'}}));expect(screen.getByRole('button',{name:'Replace Report Logo'}).hasAttribute('disabled')).toBe(true);
 expect(screen.getByText(/Saved. Refreshing/)).toBeTruthy();
});
