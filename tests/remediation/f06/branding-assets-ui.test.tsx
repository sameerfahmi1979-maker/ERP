// @vitest-environment jsdom
import '../f05/setup';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
const m=vi.hoisted(()=>({load:vi.fn()}));
vi.mock('@/server/actions/branding/assets',()=>({getReportBrandingProfileAssets:m.load}));
vi.mock('@/features/branding/branding-asset-upload-card',()=>({BrandingAssetUploadCard:({label,asset,canUpload,onChanged}:{label:string;asset:{originalFilename:string}|null;canUpload:boolean;onChanged:()=>void})=><section aria-label={label}>{asset?.originalFilename??'No asset uploaded'}<button disabled={!canUpload} onClick={onChanged}>Upload {label}</button></section>}));
import {ReportBrandingAssetsSection} from '@/features/branding/report-branding-assets-section';
const section=(id=1,canSign=false)=><FluentProvider theme={webLightTheme}><ReportBrandingAssetsSection brandingProfileId={id} ownerCompanyId={id} canUpload canSign={canSign}/></FluentProvider>;
beforeEach(()=>vi.resetAllMocks());afterEach(cleanup);
it('loading is not reported as missing assets and cannot upload',()=>{m.load.mockReturnValue(new Promise(()=>{}));render(section());expect(screen.getByRole('status').textContent).toMatch(/Loading/);expect(screen.queryByText('No asset uploaded')).toBeNull();expect(screen.queryByRole('button',{name:'Upload Report Logo'})).toBeNull();});
it('failed loading is an unavailable state with retry, not an empty catalogue',async()=>{m.load.mockResolvedValueOnce({success:false,error:'PRIVATE'}).mockResolvedValueOnce({success:true,data:[]});render(section());await screen.findByRole('alert');expect(screen.queryByText(/PRIVATE/)).toBeNull();expect(screen.queryByText('No asset uploaded')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Retry branding assets'}));await screen.findByRole('button',{name:'Upload Report Logo'});expect(m.load).toHaveBeenCalledTimes(2);});
it('a thrown read failure is handled and shows no privileged details',async()=>{m.load.mockRejectedValue(Error('PRIVATE'));render(section());await screen.findByRole('alert');expect(screen.queryByText(/PRIVATE/)).toBeNull();});
it('ignores the prior profile response and clears its preview immediately',async()=>{
 let first!:(r:unknown)=>void;m.load.mockImplementation((id:number)=>id===1?new Promise(r=>{first=r;}):Promise.resolve({success:true,data:[{id:9,assetType:'report_logo',originalFilename:'Company B synthetic',versionNo:1}]}));
 const view=render(section());view.rerender(section(2));await screen.findByText('Company B synthetic');await act(async()=>first({success:true,data:[{id:8,assetType:'report_logo',originalFilename:'Company A private',versionNo:1}]}));expect(screen.queryByText('Company A private')).toBeNull();expect(screen.getByText('Company B synthetic')).toBeTruthy();
});
it('restricted signing assets are labelled restricted, not missing or replaceable',async()=>{m.load.mockResolvedValue({success:true,data:[]});render(section());await screen.findByText(/Stamp and signature access is restricted/);expect(screen.queryByRole('button',{name:'Upload Company Stamp'})).toBeNull();expect(screen.queryByRole('button',{name:'Upload Signatory Signature'})).toBeNull();});
it('authorized signing controls appear only after a successful current-profile read',async()=>{m.load.mockResolvedValue({success:true,data:[]});render(section(1,true));expect(await screen.findByRole('button',{name:'Upload Company Stamp'})).toBeTruthy();});
it('refreshing after mutation hides stale availability until the current read completes',async()=>{m.load.mockResolvedValueOnce({success:true,data:[]}).mockResolvedValueOnce({success:false,error:'PRIVATE'});render(section());fireEvent.click(await screen.findByRole('button',{name:'Upload Report Logo'}));await screen.findByRole('alert');await waitFor(()=>expect(screen.queryByText('No asset uploaded')).toBeNull());});
