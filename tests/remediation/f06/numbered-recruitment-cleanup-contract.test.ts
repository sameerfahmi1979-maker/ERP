import fs from 'node:fs';
import {expect,it} from 'vitest';
const harness=fs.readFileSync('tests/remediation/f06/numbered-recruitment-atomic.local.test.ts','utf8');
const checker=fs.readFileSync('tests/remediation/f06/numbered-recruitment-resource-check.mjs','utf8');
it('retires newly created permission definitions in the independent finally path',()=>{
 const cleanup=harness.slice(harness.indexOf('afterAll(async()=>'));
 const permissionRetirement=cleanup.indexOf("owned.filter(row=>row.table==='permissions')");
 expect(permissionRetirement).toBeGreaterThan(cleanup.indexOf('}finally{'));
 expect(cleanup).toContain('set is_active=false where id=${row.id} and permission_name=${q(marker)} returning id');
});
it('restores borrowed permission flags without sweeping real preexisting active definitions',()=>{
 expect(harness).toContain("else if(plan.kind==='borrow')");
 expect(harness).toContain('set is_active=${row.originalActive} where id=${row.id}');
 expect(harness).not.toMatch(/update public\.permissions set is_active=false where permission_code/);
});
it('records expected permission code with each role-permission pair',()=>{expect(harness).toContain('rolePermissions.push({roleId:role,permissionId:permission,permissionCode:code})');});
it('checks exact synthetic permission ownership and inactive state',()=>{
 expect(checker).toContain("if(row.table==='permissions')predicate+=` and permission_name=${q(run.marker)} and is_active=false`");
});
it('checks expected role-permission code bindings and rejects extra permission pairs',()=>{
 expect(checker).toContain('p.permission_code=${q(row.permissionCode)}');
 expect(checker).toContain('jsonb_agg(permission_id order by permission_id)');
 expect(checker).toContain('JSON.stringify(expected)');
});
it('gives cleanup a bounded 120 seconds without weakening failure accounting or other timeouts',()=>{
 const cleanupIndex=harness.indexOf('afterAll(async()=>');
 const cleanup=harness.slice(cleanupIndex);
 expect(cleanup).toContain('},120_000);');
 expect(harness.slice(0,cleanupIndex)).not.toContain('120_000');
 expect(cleanup).toContain('cleanupFailures:failures');
 // Auth cleanup now rejects before any fixture restoration, rather than adding
 // its failures to a list after fixtures have already been touched.
 const admissionStart=harness.indexOf('async function admitCleanup(){');
 const admissionEnd=harness.indexOf('const persist=',admissionStart);
 expect(admissionStart).toBeGreaterThanOrEqual(0);expect(admissionEnd).toBeGreaterThan(admissionStart);
 const admission=harness.slice(admissionStart,admissionEnd);
 expect(admission).toContain('const result=await cleanDmsFixtureSessions(');
 const failureIndex=admission.indexOf('if(result.failures.length){');
 const refusalIndex=admission.indexOf("throw Error('Cleanup withheld: Auth session')");
 const admittedIndex=admission.indexOf('sessionAbsenceProven=true;cleanupAdmitted=true;');
 expect(failureIndex).toBeGreaterThan(admission.indexOf('const result=await cleanDmsFixtureSessions('));
 expect(admission).toContain("withheld('Exact session absence unproven; restoration and retirement withheld')");
 expect(refusalIndex).toBeGreaterThan(failureIndex);expect(admittedIndex).toBeGreaterThan(refusalIndex);
 expect(admission.indexOf('return result;')).toBeGreaterThan(admittedIndex);
 const callIndex=cleanup.indexOf('const authCleanup=await admitCleanup()');
 expect(callIndex).toBeGreaterThanOrEqual(0);expect(cleanup.indexOf('const failures:string[]=[]')).toBeGreaterThan(callIndex);
 expect(harness).toContain('if(!cleanupAdmitted||!sessionAbsenceProven||!cleanupBegun||activeBodies.size||pendingCalls.size||holders.size||signInUncertain||sqlUncertain||cleanupUnresolved)throw Error');
 expect(cleanup).toContain('expect(failures).toEqual([])');
});
