import fs from 'node:fs';
import {expect,it} from 'vitest';
const actual=fs.readFileSync('tests/remediation/f06/document-employee-atomic.local.test.ts','utf8');
const checker=fs.readFileSync('tests/remediation/f06/document-employee-resource-check.mjs','utf8');
it('guards actual execution, records intent and exact authority/session/holder cleanup without counter reset',()=>{expect(actual).toContain("ALGT_F06_DOCUMENT_EMPLOYEE_TESTS!=='1'");expect(actual).toContain("expect(process.env.ALGT_F06_LOCAL_TARGET).toBeUndefined()");expect(actual).toContain('pinned=guard()');expect(actual).toContain('permission_name=${q(marker)}');expect(actual).toContain('cleanDmsFixtureSessions');expect(actual).toContain('},120_000)');expect(actual).not.toMatch(/set (next_sequence_number|current_sequence_number)=/);});
it('authored forgery probes use a recomputed correct hash, old UPDATE and allocation/request/code negatives',()=>{expect(actual).toContain('const requestHash=');expect(actual).toContain("'hash',${requestHash(r)}");expect(actual).toContain("['code','operation','allocation-request']");expect(actual).toContain('updating an existing employee cannot manufacture INSERT proof');expect(actual).toContain('transaction is incomplete');});
it('checker remains exact read-only observation with indexed rows, no business mutation or argument-limit array',()=>{expect(checker).toContain('begin read only;');expect(checker).toContain('jsonb_agg(passed order by check_index)');expect(checker).toContain('document_employee_insert_proofs');expect(checker).toContain('auth.refresh_tokens');expect(checker).toContain('run.rolePermissions');expect(checker).not.toMatch(/jsonb_build_array\(\$\{checks|sql\(`(?:update|delete|insert)/);});
it('repeat runs borrow only tracked canonical lookup rows and restore both original lifecycle fields',()=>{
 expect(actual).toContain("expect(tracked('hr_identity_document_types',existing.id)");
 expect(actual).toContain("borrowedCatalogues.push({table:'hr_identity_document_types',...existing})");
 expect(actual).toContain('set is_active=${row.is_active},deleted_at=${q(row.deleted_at)}::timestamptz');
 expect(actual).toContain("${hrLookup?'is_active=false,':''}deleted_at=");
 expect(checker).toContain('for(const row of run.borrowedCatalogues??[])');
 expect(checker).toContain('Borrowed canonical catalogue must be owned by an exact historical manifest');
});
it('first-run cleanup failures stay visible and only a hash-bound exact repair can qualify reconciliation',()=>{
 expect(checker).toContain('repair.manifestSha256');
 expect(checker).toContain("createHash('sha256').update(bytes).digest('hex')");
 expect(checker).toContain('historicalCleanupFailures:run.cleanupFailures');
 expect(checker).toContain('historicalRepairs:repairs,newRepairs:0');
 expect(checker).toContain("assert.equal(repair.repairs,3)");
});
