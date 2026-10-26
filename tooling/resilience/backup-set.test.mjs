import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateBackupSet, verifyBackupSet, verifyRestoredObjects, fileIntegrity } from './backup-set.mjs';

const coverage = Object.fromEntries(['database','storage','auth','permissions','originals','pendingOperations','configuration','renderer'].map(k => [k,'verified']));
const make = () => ({ version:1,scope:'synthetic-laboratory',sourceCommit:'a'.repeat(40),cutoff:'2026-10-26T00:00:00Z',secretReferences:['OPENAI_API_KEY'],coverage:{...coverage},artifacts:[{kind:'database',path:'database.dump',bytes:1,sha256:'a'.repeat(64)},{kind:'object',path:'objects/original.pdf',bytes:1,sha256:'a'.repeat(64)},{kind:'configuration',path:'config.json',bytes:1,sha256:'a'.repeat(64)}] });
test('rejects a database-only backup and never claims production acceptance',()=>{const m=make();assert.equal(validateBackupSet(m).productionAccepted,false);m.artifacts=m.artifacts.filter(a=>a.kind!=='object');assert.throws(()=>validateBackupSet(m),/Object bytes/);});
test('pending recovery components remain pending after validation',()=>{const m=make();m.coverage.renderer='pending';assert.equal(validateBackupSet(m).completeCoverage,false);});
test('requires all coverage dimensions, source and cutoff',()=>{for(const change of [m=>delete m.coverage.auth,m=>m.sourceCommit='main',m=>m.cutoff='unknown',m=>m.scope='production']){const m=make();change(m);assert.throws(()=>validateBackupSet(m));}});
test('rejects traversal, absolute, Windows-stream and ambiguous paths',()=>{for(const name of ['../secret','C:/key','/key','objects/../key','objects\\key','objects//key','objects/key:stream','./key']){const m=make();m.artifacts[1].path=name;assert.throws(()=>validateBackupSet(m));}});
test('rejects duplicate case-insensitive paths and invalid sizes',()=>{let m=make();m.artifacts.push({...m.artifacts[1],path:'OBJECTS/original.pdf'});assert.throws(()=>validateBackupSet(m),/Duplicate/);for(const bytes of [-1,1.1,Infinity,Number.MAX_SAFE_INTEGER+1]){m=make();m.artifacts[1].bytes=bytes;assert.throws(()=>validateBackupSet(m));}});
test('accepts secret names but never secret values',()=>{for(const value of ['Bearer synthetic','OPENAI_API_KEY=synthetic','https://secret.invalid','lowercase-key']){const m=make();m.secretReferences=[value];assert.throws(()=>validateBackupSet(m));}});
test('checks actual bytes and exact restored object set',async()=>{
 const parent=path.resolve('.resilience');await fs.mkdir(parent,{recursive:true});const dir=await fs.mkdtemp(path.join(parent,'backup-test-'));
 try{
  const m=make();await fs.mkdir(path.join(dir,'objects'));
  for(const a of m.artifacts){await fs.writeFile(path.join(dir,a.path),a.kind);Object.assign(a,await fileIntegrity(path.join(dir,a.path)));}
  assert.equal((await verifyBackupSet(dir,m)).artifacts.length,3);
  assert.equal((await verifyRestoredObjects(path.join(dir,'objects'),m)).verifiedObjects,1);
  await fs.writeFile(path.join(dir,'objects/original.pdf'),'corrupt');await assert.rejects(verifyBackupSet(dir,m),/integrity mismatch/);
  await fs.writeFile(path.join(dir,'objects/extra.pdf'),'unexpected');await assert.rejects(verifyRestoredObjects(path.join(dir,'objects'),m),/set mismatch/);
  await fs.unlink(path.join(dir,'objects/original.pdf'));await assert.rejects(verifyBackupSet(dir,m));
 }finally{assert.ok(dir.startsWith(parent+path.sep));await fs.rm(dir,{recursive:true});}
});
