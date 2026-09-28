import { expect, it, vi } from 'vitest';
import { withDocumentReadPolicy } from '@/lib/supabase/document-read-policy';
it('preserves the browser singleton and is idempotent',()=>{
 const client={from:vi.fn()} as any;const first=withDocumentReadPolicy(client);
 expect(withDocumentReadPolicy(client)).toBe(first);expect(withDocumentReadPolicy(first)).toBe(first);
});
it('only direct reads use the projection; writes still use table RLS',()=>{
 const result={},select=vi.fn(()=>result),update=vi.fn(()=>result),raw={select:vi.fn(),update};
 const client={from:vi.fn(()=>raw),rpc:vi.fn(()=>({select}))} as any;const wrapped=withDocumentReadPolicy(client);
 expect(wrapped.from('dms_documents').select('id',{count:'exact'})).toBe(result);
 expect(client.rpc).toHaveBeenCalledWith('f03_read_documents',{}, {get:true,count:'exact'});
 expect(select).toHaveBeenCalledWith('id');
 expect(wrapped.from('dms_documents').update({title:'Test'})).toBe(result);expect(update).toHaveBeenCalledWith({title:'Test'});
 expect(wrapped.from('employees')).toBe(raw);
});
