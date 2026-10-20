import fs from 'node:fs';
import path from 'node:path';
import {expect,it} from 'vitest';

const migration=fs.readFileSync(path.resolve('supabase/migrations/20261020144150_f11_creation_consumer_provenance.sql'),'utf8');
// Static regression guard. Actual conversion/document transactions, replay and
// failure rollback are accepted separately in the owned native SQL laboratory.
it('creation origin comes from private actual-insert proof, never a caller source label',()=>{
 expect(migration).toContain('FROM erp_private.document_employee_insert_proofs p');
 expect(migration).toContain('FROM erp_private.recruitment_consumer_proofs p');
 expect(migration.match(/p\.transaction_id=pg_current_xact_id\(\)/g)).toHaveLength(2);
 expect(migration.match(/p\.actor=auth\.uid\(\)/g)).toHaveLength(2);
 expect(migration).not.toContain("current_setting('erp.document_employee'");
 expect(migration).not.toContain("current_setting('erp.recruitment_consumer'");
});
it('keeps the exact proven consumer reason and records its operation in canonical history',()=>{
 expect(migration).toContain("why:='Employee created from DMS documents (HR.14A)'");
 expect(migration).toContain("why:='Converted from candidate '||coalesce(source_candidate_code,'')");
 expect(migration).toContain('coalesce(source_operation,');
 expect(migration).toContain("why:='Employee created';effective:=NEW.joining_date");
});
it('preserves required update reason/effective-date checks and private trigger privileges',()=>{
 expect(migration).toContain('IF previous=current_facts THEN RETURN NEW');
 expect(migration).toContain('Employment changes require a reason and effective date');
 expect(migration).toContain('Future changes cannot replace current employment facts');
 expect(migration).toContain('REVOKE ALL ON FUNCTION erp_private.f11_capture_employment_event() FROM PUBLIC,anon,authenticated,service_role');
 expect(migration).not.toMatch(/\bGRANT\b|DISABLE TRIGGER|DROP POLICY|capture_document_employee_receipt|validate_recruitment_completion/i);
});
