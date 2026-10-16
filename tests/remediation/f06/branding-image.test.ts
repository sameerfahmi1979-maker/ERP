import {expect,it} from 'vitest';
import sharp from 'sharp';
import {verifyBrandingImage} from '@/server/branding-image';
import {createHash} from 'node:crypto';
it.each(['png','jpeg','webp'] as const)('decodes and normalizes actual %s bytes to a deterministic PNG',async format=>{
 const input=await sharp({create:{width:8,height:6,channels:4,background:{r:255,g:0,b:0,alpha:1}}}).toFormat(format).toBuffer();
 const file=new File([input],`synthetic.${format}`,{type:`image/${format}`});const a=await verifyBrandingImage(file),b=await verifyBrandingImage(file);
 expect(a.metadata).toMatchObject({mime:'image/png',width:8,height:6,filename:'synthetic.png',size:a.bytes.length});expect(a.metadata.sha256).toBe(createHash('sha256').update(a.bytes).digest('hex'));expect(b.bytes.equals(a.bytes)).toBe(true);
});
it.each(['<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script></svg>','<html>synthetic</html>','not an image'])('rejects active or unrecognized content disguised as PNG',async content=>{await expect(verifyBrandingImage(new File([content],'synthetic.png',{type:'image/png'}))).rejects.toThrow(/could not be verified/);});
it('rejects a truncated PNG even when its magic bytes match',async()=>{await expect(verifyBrandingImage(new File([Buffer.from([137,80,78,71,13,10,26,10,0])],'synthetic.png',{type:'image/png'}))).rejects.toThrow(/could not be verified/);});
it('checks declared content type against decoder format',async()=>{const data=await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toBuffer();await expect(verifyBrandingImage(new File([data],'wrong.webp',{type:'image/webp'}))).rejects.toThrow();});
it.each(['image/svg+xml','image/x-icon','text/html'])('new %s uploads require raster conversion',async type=>{await expect(verifyBrandingImage(new File(['synthetic'],'fixture',{type}))).rejects.toThrow(/Convert SVG and ICO/);});
it('empty bytes are rejected before storage',async()=>{await expect(verifyBrandingImage(new File([],'empty.png',{type:'image/png'}))).rejects.toThrow(/non-empty/);});
it('cleans uploaded filenames and strips trailing non-image content',async()=>{const png=await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toBuffer();const marker='PRIVATE_TRAILING_PAYLOAD';const r=await verifyBrandingImage(new File([png,marker],'../synthetic.png',{type:'image/png'}));expect(r.metadata.filename).not.toContain('/');expect(r.bytes.toString()).not.toContain(marker);});
