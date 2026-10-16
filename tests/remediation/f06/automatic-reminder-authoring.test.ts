// Source-only review. None of these files is imported/executed by this suite.
import fs from 'node:fs';
import ts from 'typescript';
import {expect,it} from 'vitest';
import {automaticReminderColumns,automaticReminderSchemaPreflightSql} from './automatic-reminder-probe-contract';
const read=(name:string)=>fs.readFileSync('tests/remediation/f06/'+name,'utf8');
const harness=read('dms-numbered-ai-approval.local.test.ts');
const race=read('automatic-reminder-lock-race.mjs');
const checker=read('automatic-reminder-resource-check.mjs');
const database=fs.readFileSync('src/types/database.ts','utf8');
function rowColumns(table:string){
 const row=database.split('      '+table+': {')[1]?.split('        Row: {')[1]?.split('        Insert: {')[0];
 if(!row)throw Error('Generated table row contract missing: '+table);
 return [...row.matchAll(/^          ([a-z_]+):/gm)].map(value=>value[1]);
}
it('reminder fixture assertions reference only actual generated reminder columns',()=>{
 const columns=rowColumns('dms_expiry_reminders');expect(columns).toContain('last_notification_at');expect(columns).not.toContain('next_retry_at');
 for(const source of [harness,checker])expect(source.includes('next_retry_at')).toBe(false);
});
it('schema preflight is generated-type exact and runs before fixture credentials or ledger setup',()=>{
 expect([...automaticReminderColumns]).toEqual(rowColumns('dms_expiry_reminders'));
 const checkerColumns=checker.match(/const expectedReminderColumns=(\[[^\n]+\]);/)?.[1];expect(checkerColumns).toBeDefined();expect(JSON.parse(checkerColumns!)).toEqual(automaticReminderColumns);
 expect(checker.includes(automaticReminderSchemaPreflightSql())).toBe(true);
 const setupStart=harness.indexOf('beforeAll(()=>safety.setup(async()=>{');
 const setupEnd=harness.indexOf('// Existing isolated private buckets',setupStart);
 expect(setupStart).toBeGreaterThanOrEqual(0);expect(setupEnd).toBeGreaterThan(setupStart);
 const setup=harness.slice(setupStart,setupEnd),guardIndex=setup.indexOf('guard()');
 const schemaIndex=setup.indexOf('assertAutomaticReminderSchema(JSON.parse(sql(automaticReminderSchemaPreflightSql())))');
 const keysIndex=setup.indexOf('const keys='),ledgerIndex=setup.indexOf('ledger=JSON.parse(');
 expect(guardIndex).toBeGreaterThanOrEqual(0);expect(schemaIndex).toBeGreaterThan(guardIndex);
 expect(keysIndex).toBeGreaterThan(schemaIndex);expect(ledgerIndex).toBeGreaterThan(schemaIndex);
 expect(checker.indexOf('assert.deepEqual(schema.reminderColumns')).toBeLessThan(checker.indexOf('const ledger='));
});
it('historical and corrected race identities remain distinct; cleanup does not depend on truncated names',()=>{
 expect(checker.includes('/^f06-(?:auto-reminder|ar)-[a-f0-9-]{36}$/')).toBe(true);
 expect(checker.includes('entry.actualApplicationName,entry.applicationName')).toBe(true);expect(checker.includes("Buffer.byteLength(entry.applicationName,'utf8')<=63")).toBe(true);
 expect(checker.includes("'historical-expected-name-only'")).toBe(true);expect(checker.includes('casePassClaim:false')).toBe(true);
 const absence=checker.slice(checker.indexOf('add(`race ${side}'),checker.indexOf('const observations='));
 expect(absence).toContain('pid=${entry.pid} and backend_start=${quote(entry.backendStart)}');expect(absence.includes('application_name=')).toBe(false);
});
it('principal wait captures and restores real profile status with exact auth identity',()=>{
 const columns=rowColumns('user_profiles');expect(columns).toContain('status');expect(columns).not.toContain('is_active');
 const probe=harness.slice(harness.indexOf("it.each(['session','principal']"),harness.indexOf("it('AR17 reminder wait rejects late sensitive-class"));
 expect(probe).toContain('select status from public.user_profiles');expect(probe).toContain("set status='inactive'");
 expect(probe).toContain('set status=${q(before)}');expect(probe).toContain('where id=${session.profileId} and auth_user_id=${q(session.authUserId)}');
 expect(probe).not.toContain('is_active');expect(checker).toContain('status=${quote(change.original)}');
});
it('replay probe avoids shadowing the reminder-row SQL alias with a PL/pgSQL variable',()=>{
 const replay=harness.slice(harness.indexOf("it.each(['sent','dismissed','cancelled','missing']"),harness.indexOf("it('AR09"));
 expect(replay).toContain('v_replayed_receipt jsonb');
 expect(replay).toContain("v_replayed_receipt->'replayed'");
 expect(replay).toContain("(v_replayed_receipt->>'documentId')::bigint");
 expect(replay).not.toMatch(/;r\s+jsonb/);
 expect(replay).toContain('reminderRowsSql(f.documentId)');
});
it('actual authoring has a concrete identified AR01–AR20 route, not offline acceptance claims',()=>{
 for(let number=1;number<=20;number++)expect(harness).toContain('AR'+String(number).padStart(2,'0'));
 expect(harness).toContain('owningBranchId:sibling');
 expect(harness).toContain('AR17 reminder wait rejects late sensitive-class read revocation');
 expect(harness).toContain("confidentialityLevel:'finance'");
});
it('staged race demonstrates a source-only holder before allowing the holder to acquire the plan',()=>{
 expect(race).toContain("const containerId=guard()");expect(race).toContain("'PGPASSWORD=postgres',containerId");
 expect(race.indexOf("holder.process.stdin.write(sourceLockSql")).toBeLessThan(race.indexOf("contender=launch('contender')"));
 expect(race.indexOf('assert.ok(blocked')).toBeLessThan(race.indexOf("holder.process.stdin.end(completionSql"));
 expect(race).toContain('any(pg_blocking_pids(pid))');expect(race).toContain('backend_start=${quote(contenderIdentity.backendStart)}');
 expect(race).toContain("assert.equal(first.code,0");expect(harness).toContain('expect(result.second.code).toBe(0)');
});
it('staged race bounds both sessions and independently checks exact backend disappearance',()=>{
 for(const setting of ["statement_timeout='20s'","lock_timeout='15s'","idle_in_transaction_session_timeout='25s'"])expect(race).toContain(setting);
 expect(race).toContain('finally{');expect(race).toContain('Promise.allSettled');
 expect(race).toContain("holder.process.stdin.end('rollback;");expect(race).toContain("contender.process.stdin.end('rollback;");
 expect(race).toContain('pid=${identity.pid} and backend_start=${quote(identity.backendStart)}');
 expect(race).toContain("observe({stage:'cleanup'");
});
it('sensitive-read fixture is one company permission, restores exact flags and never borrows admin',()=>{
 const window=harness.slice(harness.indexOf('async function withFinanceView'),harness.indexOf('describe.skipIf'));
 expect(window).toContain("const code='dms.documents.view.finance'");expect(window).not.toContain("'dms.admin'");
 expect(window).toContain('No unrelated dormant finance grant may become effective');
 expect(window).toContain('owner_company_id:ledger.companyIds[0]');expect(window).toContain('originalActive');
 expect(window).toContain("[['user_roles',assignment],['roles',role]]");expect(window).toContain('caseCleanupFailures.push(...failures)');
});
it('supplemental checker keeps historical evidence separate and checks exact current restored resources',()=>{
 expect(checker).toContain("if(!Object.hasOwn(m,'automaticReminderProbes')){historicalFiles.push(file);continue;}");
 expect(checker).toContain('Run AFTER the unchanged dms-numbered-ai-approval-resource-check.mjs');
 expect(checker).toContain("assert.deepEqual(m.reminderAdminGrants,[]");
 expect(checker).toContain('original scope restored and retired');expect(checker).toContain('original completion fact restored');
 expect(checker).toContain('original active flag restored');expect(checker).toContain('auth.refresh_tokens');
 expect(checker).toContain('exact original automatic schedule');expect(checker).toContain('recipients_json is not null');
 expect(checker).toContain('backend_start=${quote(entry.backendStart)}');
 expect(checker).toContain('begin transaction read only;');expect(checker).toContain("checks.join(' union all ')");
 expect(checker).toContain("{flag:'wx'}");expect(checker).toContain('casePassClaim:false');expect(checker).not.toContain('keys-private.json');
 expect(checker).not.toMatch(/sql\(`(?:update|delete|insert|create|alter|drop)\b/i);
});
it.each(['automatic-reminder-lock-race.mjs','automatic-reminder-resource-check.mjs'])('parses %s without loading its runtime imports',name=>{
 const source=ts.createSourceFile(name,read(name),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 expect((source as ts.SourceFile&{parseDiagnostics:unknown[]}).parseDiagnostics).toEqual([]);
});
