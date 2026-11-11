import {expect,it,vi} from 'vitest';
import JSZip from 'jszip';
import {buildDmsSelectedZip,dmsZipEntryNames,type DmsZipFile} from '@/lib/dms/selected-download';
const files:DmsZipFile[]=[{id:1,name:'شهادة.pdf',size:3,folder:'DMS-1'},{id:2,name:'شهادة.pdf',size:3,folder:'DMS-1'}];
const options=()=>({signal:new AbortController().signal,isCurrent:()=>true,onProgress:vi.fn()});
const attachment=(body:BodyInit,name=files[0].name,headers:Record<string,string>={})=>new Response(body,{headers:{'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(name)}`,...headers}});
it('packages only selected authorized responses with Arabic names and collision-safe entries',async()=>{
 const fetcher=vi.fn(async()=>attachment(new Uint8Array([1,2,3])));
 const opts=options();const blob=await buildDmsSelectedZip(files,{...opts,fetcher:fetcher as typeof fetch});
 const zip=await JSZip.loadAsync(await blob.arrayBuffer());
 expect(Object.keys(zip.files).filter(k=>!zip.files[k].dir)).toEqual(['DMS-1/شهادة.pdf','DMS-1/شهادة (2).pdf']);
 expect(await zip.file('DMS-1/شهادة.pdf')!.async('uint8array')).toEqual(new Uint8Array([1,2,3]));
 expect(fetcher.mock.calls.map(c=>(c as unknown[])[0])).toEqual(['/api/dms/file?fileId=1&disposition=attachment','/api/dms/file?fileId=2&disposition=attachment']);
 expect(opts.onProgress).toHaveBeenNthCalledWith(2,2,2);
});
it('sanitizes traversal, unsafe Windows names and path separators',()=>{
 const names=dmsZipEntryNames([{id:1,name:'../../CON.pdf',folder:'../x',size:1},{id:2,name:'CON.pdf',size:1}]);
 expect(names[0]).not.toContain('../');expect(names[1]).toBe('_CON.pdf');expect(names.every(n=>!n.includes('\\'))).toBe(true);
});
it('fails the entire ZIP if any protected endpoint denies access',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(attachment('abc')).mockResolvedValueOnce(new Response('private reason',{status:403}));
 await expect(buildDmsSelectedZip(files,{...options(),fetcher})).rejects.toThrow(/current access/);
});
it('rejects changed and truncated file responses',async()=>{
 for(const response of [attachment('ab'),attachment('abcd'),attachment('abc',files[0].name,{'content-length':'999'})])await expect(buildDmsSelectedZip([files[0]],{...options(),fetcher:vi.fn().mockResolvedValue(response)})).rejects.toThrow(/incomplete|size changed|changed/);
});
it('rejects login/error pages and renamed files instead of putting them in the archive',async()=>{
 for(const response of [new Response('<html>login</html>'),attachment('abc','renamed.pdf')])await expect(buildDmsSelectedZip([files[0]],{...options(),fetcher:vi.fn().mockResolvedValue(response)})).rejects.toThrow(/unavailable|renamed/);
});
it('checks current account after each asynchronous response',async()=>{
 let live=true;const opts={...options(),isCurrent:()=>live,fetcher:vi.fn(async()=>{live=false;return new Response('abc');})};
 await expect(buildDmsSelectedZip(files,opts)).rejects.toThrow(/account or access changed/);expect(opts.fetcher).toHaveBeenCalledOnce();
});
it('does not fetch invalid, duplicated, oversized or empty selections',async()=>{
 for(const input of [[],[files[0],files[0]],[{...files[0],id:-1}],Array.from({length:51},(_,i)=>({...files[0],id:i+1})),[{...files[0],size:51*1024*1024}],Array.from({length:3},(_,i)=>({...files[0],id:i+1,size:40*1024*1024}))]){
  const fetcher=vi.fn();await expect(buildDmsSelectedZip(input,{...options(),fetcher})).rejects.toThrow(/Select up to/);expect(fetcher).not.toHaveBeenCalled();
 }
});
it('honors cancellation before reading files',async()=>{
 const controller=new AbortController();controller.abort();const fetcher=vi.fn();await expect(buildDmsSelectedZip(files,{...options(),signal:controller.signal,fetcher})).rejects.toThrow(/cancelled/);expect(fetcher).not.toHaveBeenCalled();
});
