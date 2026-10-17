import {createRequire} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';
const {classifyDeclaration}=createRequire(import.meta.url)(path.resolve('tooling/performance/export-review.cjs'));
function classify(text:string){return classifyDeclaration(ts.createSourceFile('example.ts',text,ts.ScriptTarget.Latest,true).statements[0]);}
it('separates type exports from runtime actions',()=>expect(classify('export type AuditActor = {id:number}').kind).toBe('TYPE_ONLY_EXPORT'));
it('separates interface exports from runtime actions',()=>expect(classify('export interface Actor {id:number}').kind).toBe('TYPE_ONLY_EXPORT'));
it('does not infer reads from export names',()=>expect(classify('export function getData(){ return db.from("x").delete().select(); }').kind).toBe('MIXED_READ_WRITE_SYNTAX'));
it('retains RPC uncertainty',()=>expect(classify('export function listData(){return db.rpc("list_data");}').calls.some((c:{kind:string})=>c.kind==='RPC_EFFECT_UNRESOLVED')).toBe(true));
it('does not bless delegated helpers as pure',()=>expect(classify('export function listData(){return unknownHelper();}').kind).toBe('DELEGATED_EFFECT_REVIEW'));
it('does not promote a select to a purity proof',()=>expect(classify('export function data(){return db.from("x").select();}').kind).toBe('READ_SYNTAX_NOT_PURITY_PROOF'));
it('does not mistake no calls for read-only execution',()=>expect(classify('export function action(){ object.value=1; }').kind).toBe('NO_DIRECT_CALL_SYNTAX'));
it('retains absent declarations as unresolved',()=>expect(classifyDeclaration(undefined).kind).toBe('UNRESOLVED_EXPORT'));
