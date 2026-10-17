import {createRequire} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';
const helper=createRequire(import.meta.url)(path.resolve('tooling/performance/inventory-semantics.cjs'));
function classify(source:string,file='src/features/example.tsx',reviews:Record<string,string>={}){
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  return helper.classifySource(ts,ast,file,(module:string)=>module.startsWith('@/')?'src/'+module.slice(2):null,reviews);
}
it('distinguishes constructors, lifecycle control, HTTP and genuine read chains',()=>{
  const result=classify('Array.from([]); Buffer.from("x"); refetch(); query.refetch(); fetch("/read"); db.from("rows").select("id").range(0,24);');
  expect(result.signals.filter((s:{kind:string})=>s.kind==='NON_DATABASE_CONSTRUCTOR')).toHaveLength(2);
  expect(result.signals.filter((s:{kind:string})=>s.kind==='READ_LIFECYCLE_CONTROL')).toHaveLength(2);
  expect(result.signals.filter((s:{kind:string})=>s.kind==='FETCH_TRANSPORT_CANDIDATE')).toHaveLength(1);
  expect(result.signals.filter((s:{kind:string})=>s.kind==='DATABASE_READ_CHAIN_CANDIDATE')).toHaveLength(3);
});
it('does not remove a shadowed Array or Buffer as a built-in constructor',()=>{
  const result=classify('function f(Array,Buffer){ Array.from("rows").select("id"); Buffer.from("rows").select("id"); }');
  expect(result.signals.some((s:{kind:string})=>s.kind==='NON_DATABASE_CONSTRUCTOR')).toBe(false);
});
it.each(['insert','update','upsert','delete'])('keeps %s returning-select chains out of standalone reads',method=>{
  const result=classify(`db.from("rows").${method}({id:1}).select("id");`);
  expect(result.signals.every((s:{kind:string})=>s.kind==='MUTATION_CHAIN_INCLUDING_RETURNED_ROWS')).toBe(true);
});
it('keeps unknown RPCs unknown instead of guessing read safety',()=>{
  expect(classify('db.rpc("get_or_create");').signals[0].kind).toBe('RPC_REQUIRES_SEMANTIC_REVIEW');
});
it('resolves alias, namespace and callback references by exact module/export',()=>{
  const result=classify('import {getRows as rows} from "@/server/actions/data"; import * as q from "@/server/actions/data"; useQuery({queryFn:rows}); q.getRows();');
  expect(result.actionReferences).toEqual(expect.arrayContaining([expect.objectContaining({module:'src/server/actions/data',symbol:'getRows'})]));
});
it('does not turn an exact reviewed mutation into a read or exclude another resolve export',()=>{
  const result=classify('import {resolveDmsReviewQueueItem} from "@/server/actions/dms/review-queue"; import {resolveTemplatePreview} from "@/server/actions/preview"; resolveDmsReviewQueueItem(); resolveTemplatePreview();','src/features/view.tsx',{'src/server/actions/dms/review-queue#resolveDmsReviewQueueItem':'MUTATION'});
  expect(result.actionReferences.map((r:{classification:string})=>r.classification)).toEqual(['MUTATION','ACTION_REQUIRES_CALLEE_REVIEW']);
});
it('does not treat comments or imported declarations alone as invocation',()=>{
  expect(classify('import {getRows} from "@/server/actions/data"; // getRows();\nconst s="getRows()";').actionReferences).toEqual([]);
});
it('records tests and unresolved dynamic imports without removing source records',()=>{
  const result=classify('import(variable); Array.from([]);','src/lib/__tests__/sample.test.ts');
  expect(result.role).toBe('TEST_ONLY_SOURCE');expect(result.unresolvedDynamicImport).toBe(true);
  expect(result.qualification).toBe('STATIC_DISCOVERY_NOT_EXECUTION_OR_ACCEPTANCE');
});
it.each([
  ['import type {A} from "./a";',false],['import {type A} from "./a";',false],['import {type A,b} from "./a";',true],['import "./a";',true],['import A from "./a";',true],['import * as a from "./a";',true],
])('classifies runtime import %s',(source,expected)=>{
  const ast=ts.createSourceFile('a.ts',source,ts.ScriptTarget.Latest,true);
  expect(helper.hasRuntimeImport(ts,ast.statements[0])).toBe(expected);
});
it.each([['export type {A} from "./a";',false],['export {type A} from "./a";',false],['export {type A,b} from "./a";',true],['export * from "./a";',true]])('classifies runtime re-export %s',(source,expected)=>{
  const ast=ts.createSourceFile('a.ts',source,ts.ScriptTarget.Latest,true);
  expect(helper.hasRuntimeExport(ts,ast.statements[0])).toBe(expected);
});
