// MAIN ONLY read-only reconciliation; no browser/replay/OCR/upload claim.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openNumberedHRRuntime} from './n05-n07-browser-runtime.mjs';
import {commandsFor,assertRequest,assertAppendOnly} from './n05-n07-browser-contract.mjs';
import {observeNumberedHR,assertNumberedHRState,assertCommitContinuity} from './n05-n07-browser-fixture.mjs';

export function checkNumberedHRResources(name){let rt;try{
 rt=openNumberedHRRuntime(name,{readOnly:true});const stored=rt.stored(),base=stored.base;assert.deepEqual(stored.events.filter(e=>e.event==='command-success').map(e=>e.command),commandsFor(name));assert.equal(stored.events.at(-1).event,'command-success');assert.equal(rt.lifetimeExists(),false);assert.equal(rt.exists('command-lock-private.json'),false);assert.equal(rt.exists('resource-check-private.json'),false);rt.noOtherActor();
 const r=rt.read('resources-prepare-private.json'),prepared=rt.read('actor-prepare-private.json'),committed=rt.read('observe-committed-before-loss-private.json'),replayed=rt.read('observe-replayed-private.json'),retired=rt.read('resources-retire-private.json'),reviewed=name==='N07'?rt.read('observe-reviewed-private.json').snapshot:null;
 const original=rt.capturedRequest('original'),retry=rt.capturedRequest('retry');assert.equal(original.sha256,committed.requestSha256);assert.equal(original.sha256,replayed.originalRequestSha256);assert.equal(retry.sha256,replayed.retryRequestSha256);assert.deepEqual(retry.request,original.request);assert.deepEqual(original.request,committed.request);const request=assertRequest(original.request,name,base,r,reviewed?.sourceFingerprint??null);
 // Revalidate stored raw observations, including every prior audit/receipt row.
 assertNumberedHRState(prepared.initial,name,base,r,prepared);if(reviewed)assertNumberedHRState(reviewed,name,base,r,prepared,{reviewed:true});const invalid=rt.read('observe-invalid-private.json').snapshot;assertNumberedHRState(invalid,name,base,r,prepared,{reviewed:name==='N07'});assert.deepEqual(invalid.observed,(reviewed??prepared.initial).observed);
 assertNumberedHRState(committed.snapshot,name,base,r,prepared,{request});assertAppendOnly({audits:invalid.observed.audits,requests:invalid.observed.requests,recruitmentReceipts:invalid.observed.recruitmentReceipts,documentReceipts:invalid.observed.documentReceipts},committed.snapshot.observed);
 assertNumberedHRState(replayed.snapshot,name,base,r,prepared,{request});assertCommitContinuity(committed.snapshot,replayed.snapshot,name);const actorRetired=rt.read('actor-retire-private.json').snapshot;assertNumberedHRState(actorRetired,name,base,r,prepared,{request,retiredActor:true});assertCommitContinuity(committed.snapshot,actorRetired,name);
 assertNumberedHRState(retired.snapshot,name,base,r,prepared,{request,retiredActor:true,retiredResources:true});assertCommitContinuity(committed.snapshot,retired.snapshot,name,{retired:true});
 const current=observeNumberedHR(rt,name,base,r,prepared,request);assertNumberedHRState(current,name,base,r,prepared,{request,retiredActor:true,retiredResources:true});assert.deepEqual(current,retired.snapshot,'FINAL_RESOURCE_OR_HISTORY_CHANGED');rt.prerequisitesGuard(current.prerequisites);rt.providersOff();
 const result={state:'PASS_EXACT_NUMBERED_HR_RESOURCES_ONLY',name,marker:base.marker,nonce:base.nonce,sourceSha256:base.sourceSha256,retired:true,historyRetained:true,repairs:0,prerequisitesRestored:false,browserPassClaim:false,replayClaim:false,ocrClaim:false,uploadClaim:false,identity:retired.identity,at:new Date().toISOString()};rt.exclusive('resource-check-private.json',result);process.stdout.write(JSON.stringify(result)+'\n');return true;
 }catch{process.stderr.write(JSON.stringify({name,state:'FAIL_NUMBERED_HR_RESOURCE_CHECK',redacted:true,noRepairs:true})+'\n');return false;}finally{rt?.close();}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){if(process.argv.length!==3){process.stderr.write('EXACT_MODE_REQUIRED\n');process.exitCode=1;}else if(!checkNumberedHRResources(process.argv[2]))process.exitCode=1;}
