import { createRequire } from 'node:module';
import { describe,expect,it } from 'vitest';
const {verifyBaseline,digest}=createRequire(import.meta.url)('../../../tooling/schema/release-guard.cjs');
describe('fail-closed migration release baseline',()=>{
 const history={rows:[{version:'20260101000000',sha256:'synthetic-hash'}]};
 const catalog={relations:[{name:'synthetic',rls:true}],policies:[{name:'synthetic-policy',check:'owner_only'}]};
 const manifest={strategy:'verified-schema-baseline',applied:history.rows,catalog:Object.fromEntries(Object.entries(catalog).map(([k,v])=>[k,digest(v)]))};
 it('accepts exact reviewed baseline without allowing any legacy replay',()=>{expect(verifyBaseline(manifest,history,catalog)).toEqual({pass:true,automatic_legacy_replay:false,approved_pending_migrations:0});});
 it('compares semantic JSON keys independent of serialization order',()=>{expect(verifyBaseline(manifest,history,{...catalog,relations:[{rls:true,name:'synthetic'}]}).pass).toBe(true);});
 it('rejects removed migration history',()=>{expect(()=>verifyBaseline(manifest,{rows:[]},catalog)).toThrow('history changed');});
 it('rejects changed applied SQL hashes',()=>{expect(()=>verifyBaseline(manifest,{rows:[{...history.rows[0],sha256:'changed'}]},catalog)).toThrow('history changed');});
 it('rejects an unexpected new applied version',()=>{expect(()=>verifyBaseline(manifest,{rows:[...history.rows,{version:'20270101000000',sha256:'extra'}]},catalog)).toThrow('history changed');});
 it('rejects RLS or policy drift, not only table names',()=>{expect(()=>verifyBaseline(manifest,history,{...catalog,relations:[{name:'synthetic',rls:false}]})).toThrow('relations');expect(()=>verifyBaseline(manifest,history,{...catalog,policies:[]})).toThrow('policies');});
});
