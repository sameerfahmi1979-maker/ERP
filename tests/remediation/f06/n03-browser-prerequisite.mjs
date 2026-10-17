// MAIN ONLY exact synthetic flag window. No automatic recovery or other flags.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openN03Runtime} from './n03-browser-runtime.mjs';
import {n03,assertFlag,flagSql,flagHistorySql,flagTransitionSql,preserveExcept} from './n03-browser-contract.mjs';
export function runN03Prerequisite(command){let rt,stage='preflight';try{
 assert.ok(['flag-open','flag-close'].includes(command));rt=openN03Runtime();const base=command==='flag-open'?rt.freshReservation():rt.stored().base;
 const before=assertFlag(rt.query(flagSql()),command==='flag-open'?'10':'11',command!=='flag-open');if(command==='flag-open')assert.deepEqual([before],base.flagBefore);
 else{const opened=rt.read('flag-open-private.json'),checked=rt.read('fixture-check-private.json');assert.equal(checked.state,'PASS_EXACT_N03_RETIRED_FIXTURE_ONLY');assert.equal(checked.nonce,base.nonce);assert.deepEqual(before,opened.after);assert.deepEqual(rt.query(flagHistorySql()),opened.history);}
 rt.start(command,base);const history=rt.query(flagHistorySql());stage='exact-flag-transition';rt.append('flag-transition-intent',{id:9,code:'DMS_BATCH_INTAKE',before,enabled:command==='flag-open',onlyChangedFields:['is_enabled','updated_at'],triggerRevision:true,businessAuditClaim:false});
 const result=rt.sql(flagTransitionSql(before,command==='flag-open'),true).split('\n');assert.equal(result.length,2);assert.equal(result[0],'9');const after=assertFlag(JSON.parse(result[1]),command==='flag-open'?'11':'12',command==='flag-open');
 preserveExcept(before,after,['is_enabled','updated_at','workspace_revision'],'FLAG_NON_WINDOW_FIELD_CHANGED');assert.notEqual(after.updated_at,before.updated_at);assert.deepEqual(rt.query(flagHistorySql()),history);
 rt.receipt(command+'-private.json',{nonce:base.nonce,marker:n03.marker,sourceSha256:base.sourceSha256,before,after,history,businessAuditClaim:false,providerCalls:0,browserPassClaim:false});rt.succeed(base);process.stdout.write(JSON.stringify({marker:n03.marker,command,state:'PASS_EXACT_FLAG_WINDOW_ONLY',browserPassClaim:false})+'\n');return true;
 }catch{rt?.failure(stage);process.stderr.write(JSON.stringify({marker:n03.marker,command,state:'FAIL_RETAINED',stage,redacted:true,noAutomaticRetry:true})+'\n');return false;}finally{rt?.close();}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){if(process.argv.length!==3){process.stderr.write('ONE_EXPLICIT_FLAG_COMMAND_REQUIRED\n');process.exitCode=1;}else if(!runN03Prerequisite(process.argv[2]))process.exitCode=1;}
