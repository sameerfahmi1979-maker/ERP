import fs from 'node:fs';
import path from 'node:path';
import {describe,expect,it} from 'vitest';

const base='20261025093000_administrator_scope_policy.sql';
const registry=JSON.parse(fs.readFileSync(path.resolve('docs/security/administrator-capabilities.json'),'utf8')) as {
  version:string;state:string;permissions:{code:string;module:string;scope:string;reason:string;acceptance:string}[];
};
const policy=fs.readFileSync(path.resolve('supabase/migrations',base),'utf8');
function hasUnclassifiedInsert(input:string):boolean {
 const sql=input.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');
 const classifiedUpdate=/update\s+(?:public\.)?permissions\s+(?:\w+\s+)?set\s+administrator_scope\s*=/i.test(sql);
 return [...sql.matchAll(/insert\s+into\s+(?:public\.)?permissions\s*\(([^)]+)\)([\s\S]*?);/gi)]
  .some(insert=>!/\badministrator_scope\b/i.test(insert[1])&&!classifiedUpdate);
}
describe('administrator capability contract',()=>{
 it('keeps the explicit register and executable seed in agreement',()=>{
  const seed=policy.split('UPDATE public.permissions p SET administrator_scope=v.scope FROM (VALUES')[1]?.split(') v(code,scope)')[0];
  expect(seed).toBeTruthy();
  const entries=[...seed.matchAll(/\('([^']+)','(global|company|branch|held)'\)/g)].map(m=>({code:m[1],scope:m[2]}));
  expect(entries).toEqual(registry.permissions.map(({code,scope})=>({code,scope})));
  expect(new Set(entries.map(p=>p.code)).size).toBe(entries.length);expect(entries.length).toBeGreaterThan(0);
  for(const permission of registry.permissions){expect(permission.reason.length).toBeGreaterThan(10);expect(permission.acceptance).toBeTruthy();}
 });
 it('keeps unreviewed definitions held instead of inheriting them by default',()=>{
  expect(policy).toMatch(/administrator_scope text NOT NULL DEFAULT 'held'/);
  if(registry.permissions.some(p=>p.scope==='held'||p.acceptance.startsWith('pending')))expect(registry.state).not.toBe('accepted');
 });
 it.each([
  ["INSERT INTO public.permissions(permission_code) VALUES('sample.read');",true],
  ["INSERT INTO public.permissions(permission_code,administrator_scope) VALUES('sample.read','branch');",false],
  ["-- INSERT INTO public.permissions(permission_code) VALUES('sample.read');",false],
  ["INSERT INTO public.permissions(permission_code) VALUES('sample.read'); UPDATE public.permissions SET administrator_scope='branch' WHERE permission_code='sample.read';",false],
 ])('checks future literal permission inserts: %s',(sql,expected)=>expect(hasUnclassifiedInsert(sql)).toBe(expected));
 it('requires post-policy permission insert migrations to declare administrator classification',()=>{
  const missing=fs.readdirSync(path.resolve('supabase/migrations')).filter(name=>name.endsWith('.sql')&&name>base)
   .filter(name=>hasUnclassifiedInsert(fs.readFileSync(path.resolve('supabase/migrations',name),'utf8')));
  expect(missing,'New capabilities require explicit scope, register entries and native allow/deny tests').toEqual([]);
 });
});
