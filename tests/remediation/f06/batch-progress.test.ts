import {expect,it} from 'vitest';
import {batchIntakeProgress} from '@/lib/dms/batch-progress';
it('reserved uploads are not shown as active AI processing',()=>{
 expect(batchIntakeProgress('uploaded')).toEqual({label:'Waiting for upload / AI start',value:0});
});
it('shows separate OCR, AI and reviewed draft stages',()=>{
 expect(batchIntakeProgress('ocr_processing').label).toBe('Reading file (OCR)');
 expect(batchIntakeProgress('ai_processing').label).toBe('AI analysis running');
 expect(batchIntakeProgress('review_pending').value).toBeLessThan(100);
 expect(batchIntakeProgress('review_pending',true).value).toBe(100);
});
it('unknown, failed and closed states never pretend to be progressing',()=>{
 for(const state of ['failed','expired','cancelled','discarded','unexpected'])expect(batchIntakeProgress(state).value).toBe(0);
});
