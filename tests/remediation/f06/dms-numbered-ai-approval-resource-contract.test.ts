// Offline only: import the pure contract, never the checker or local-db runtime.
import fs from 'node:fs';
import {expect,it} from 'vitest';
import {reconcileUploadSessionCreationIntents as reconcile} from './dms-numbered-ai-approval-resource-contract.mjs';

it('retains all 49 intents and 45 returned sources while reporting four exact observed absences',()=>{
 const codes=Array.from({length:49},(_,i)=>`FDAI_EXACT_${i}`);
 const ids=Array.from({length:45},(_,i)=>i+1);
 const rows=ids.map((id,i)=>({id,session_code:codes[i]}));
 const original=JSON.stringify({codes,ids,rows});
 const result=reconcile(codes,ids,rows);
 expect(result.intentCount).toBe(49);expect(result.returnedSourceCount).toBe(45);
 expect(result.intendedSessionCodes).toEqual(codes);expect(result.returnedSourceIds).toEqual(ids);
 expect(result.failures).toEqual([]);expect(result.unreturnedAttempts).toHaveLength(4);
 expect(result.unreturnedAttempts).toEqual(codes.slice(45).map(sessionCode=>({sessionCode,observedRowIds:[],observedAbsent:true,classification:'unreturned_intent_proven_absent',creationSuccessClaim:false})));
 expect(JSON.stringify({codes,ids,rows})).toBe(original);
});
it('fails an existing row with an unreturned exact code without adopting its ID',()=>{
 const result=reconcile(['A','B'],[1],[{id:1,session_code:'A'},{id:99,session_code:'B'}]);
 expect(result.failures).toEqual(['Unreturned upload session intent B: existing exact row requires main reconciliation']);
 expect(result.returnedSourceIds).toEqual([1]);expect(result.returnedSourceCount).toBe(1);
 expect(result.unreturnedAttempts).toEqual([{sessionCode:'B',observedRowIds:[99],observedAbsent:false,classification:'unreturned_intent_requires_reconciliation',creationSuccessClaim:false}]);
});
it('processes intents even if no INSERT returned an ID',()=>{
 expect(reconcile(['A'],[],[]).unreturnedAttempts[0].observedAbsent).toBe(true);
 expect(reconcile(['A'],[],[{id:4,session_code:'A'}]).failures).toHaveLength(1);
 expect(reconcile([],[],[])).toMatchObject({intentCount:0,returnedSourceCount:0,failures:[],unreturnedAttempts:[]});
});
it('never excuses missing or renamed already-owned source identities',()=>{
 expect(reconcile(['A'],[1],[]).failures).toContain('Returned upload session 1: exact row missing');
 expect(reconcile(['A'],[1],[{id:1,session_code:'RENAMED'}]).failures).toContain('Returned upload session 1: original session_code missing');
 expect(reconcile([], [1], [{id:1,session_code:'NO_INTENT'}]).failures).toHaveLength(1);
});
it('fails ambiguous exact code matches even if one row is already owned',()=>{
 expect(reconcile(['A'],[1],[{id:1,session_code:'A'},{id:2,session_code:'A'}]).failures).toEqual(['Upload session intent A: ambiguous exact identity']);
 const unreturned=reconcile(['A'],[],[{id:1,session_code:'A'},{id:2,session_code:'A'}]);
 expect(unreturned.failures).toHaveLength(1);expect(unreturned.unreturnedAttempts[0].observedRowIds).toEqual([1,2]);
});
it('rejects malformed, duplicate or prefix-only observations',()=>{
 expect(()=>reconcile(['A','A'],[],[])).toThrow('Duplicate source creation intent');
 expect(()=>reconcile(['A'],[1,1],[])).toThrow('Duplicate returned source ID');
 expect(()=>reconcile([''],[],[])).toThrow('Expected exact session_code');
 expect(()=>reconcile(['A'],[0],[])).toThrow('Expected returned source ID');
 expect(()=>reconcile(['A'],[],[{id:2,session_code:'A_SUFFIX'}])).toThrow('Observation outside exact source identity query');
 expect(()=>reconcile(['A'],[1],[{id:1,session_code:'A'},{id:1,session_code:'A'}])).toThrow('Duplicate observed source ID');
});
it('checker scopes the exception to sources, rechecks exact absence and retains strict other identities',()=>{
 const checker=fs.readFileSync('tests/remediation/f06/dms-numbered-ai-approval-resource-check.mjs','utf8');
 expect(checker).toContain('where session_code in (${texts(sourceCodes)}) or id in (${list(sources)})');
 expect(checker).toContain('where session_code=${quote(attempt.sessionCode)}');
 expect(checker).toContain('const failed=[...sourceCreation.failures,');
 expect(checker).toContain('capturedSources:sources.length,sourceCreation,');
 const strict=checker.slice(checker.indexOf('for(const [table,column] of Object.entries('),checker.indexOf('for(const intent of intents.filter'));
 expect(strict).not.toContain('dms_upload_sessions');
 expect(strict.indexOf('assert.equal(values.length,exact.length)')).toBeLessThan(strict.indexOf('if(!exact.length)continue'));
 expect(checker).toContain('Current absence cannot prove that a transaction never committed historically');
 expect(checker).toContain('casePassClaim:false');expect(checker).toContain('repairs:0');
});
it('pure reconciliation contains no I/O, SQL, resource adoption or runtime import',()=>{
 const source=fs.readFileSync('tests/remediation/f06/dms-numbered-ai-approval-resource-contract.mjs','utf8');
 expect(source).not.toMatch(/local-db|readFile|writeFile|spawn|fetch\(|sql\(|owned\.push|returnedIds\.push|sessionCodes\.push/);
});
