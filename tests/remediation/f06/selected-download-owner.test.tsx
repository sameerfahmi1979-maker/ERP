// @vitest-environment jsdom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({owner:null as any,build:vi.fn()}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>m.owner}));
vi.mock('@/lib/dms/selected-download',()=>({buildDmsSelectedZip:m.build}));
import {useDmsSelectedDownload} from '@/hooks/use-dms-selected-download';
beforeEach(()=>{vi.clearAllMocks();m.owner={identity:{authUserId:'one',scopeVersion:'1'},generation:1,isLive:()=>true,admits:()=>true};vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:synthetic'),revokeObjectURL:vi.fn()}));vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>undefined)});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()});
it('cancels and clears the visible download on account switch; old bytes cannot escape',async()=>{
 let resolve!:(b:Blob)=>void;m.build.mockImplementation(()=>new Promise(r=>{resolve=r}));
 const {result,rerender}=renderHook(()=>useDmsSelectedDownload());let pending!:Promise<void>;
 act(()=>{pending=result.current.download(async()=>[{id:1,name:'one',size:1}])});
 await waitFor(()=>expect(m.build).toHaveBeenCalledOnce());
 const signal=m.build.mock.calls[0][1].signal as AbortSignal;
 m.owner={...m.owner,identity:{authUserId:'two',scopeVersion:'2'},generation:2};rerender();
 expect(signal.aborted).toBe(true);expect(result.current.busy).toBe(false);expect(result.current.progress).toBe('');
 await act(async()=>{resolve(new Blob(['old']));await pending});expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('does not admit a second download while one is in flight',async()=>{
 let resolve!:(b:Blob)=>void;m.build.mockImplementation(()=>new Promise(r=>{resolve=r}));const load=vi.fn(async()=>[{id:1,name:'one',size:1}]);
 const {result}=renderHook(()=>useDmsSelectedDownload());let pending!:Promise<void>;
 act(()=>{pending=result.current.download(load)});await waitFor(()=>expect(m.build).toHaveBeenCalledOnce());
 await act(async()=>{await result.current.download(load)});expect(load).toHaveBeenCalledOnce();
 await act(async()=>{resolve(new Blob(['zip']));await pending});expect(URL.createObjectURL).toHaveBeenCalledOnce();
});
