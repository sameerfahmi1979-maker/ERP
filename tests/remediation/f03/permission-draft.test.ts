import { describe, it, expect } from 'vitest';
import { parsePermissionDraft } from '@/features/roles/permission-draft';
describe('permission draft restoration',()=>{
 it('retains original reviewed state across a workspace remount',()=>{
  const draft={42:{assigned:true,expectedAssigned:false},43:{assigned:false,expectedAssigned:true}};
  expect(parsePermissionDraft(JSON.stringify(draft))).toEqual(draft);
 });
 it.each(['null','[]','bad','{"0":{"assigned":true,"expectedAssigned":false}}','{"1":{"assigned":"true","expectedAssigned":false}}'])('rejects malformed snapshot %s',value=>expect(parsePermissionDraft(value)).toEqual({}));
 it('drops unchanged values',()=>expect(parsePermissionDraft('{"1":{"assigned":true,"expectedAssigned":true}}')).toEqual({}));
});
