// Offline source checks ONLY. Never import the executable or read private files.
import {expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const source = fs.readFileSync(path.resolve('tests/remediation/f06/browser-acceptance-actor.mjs'),'utf8');

it('pins the main local target and one explicitly registered non-deliverable synthetic actor per run',()=>{
  for(const value of ['68ba17ecef10f3f77ae563b68d68bd146331bf844eeb735a3dae0d7831fd1d0c',
    'http://127.0.0.1:16621',"HostPort:'16622'", "'/supabase_db_algt-f06-local'", "'algt-f06-local'",
    "'c:/dev/agt-erp-f06'", "process.argv.length, 3", "['prepare','observe','retire']",
    "process.env.ALGT_F06_BROWSER_ACTOR, marker", "process.env.ALGT_F06_LOCAL_TARGET, 'main-local'",
    'F06BROWSER0510', 'f06-browser0510@example.invalid', 'supabase/.temp/project-ref']) expect(source).toContain(value);
  expect(source).not.toContain("from './local-db.mjs'");
  expect(source).not.toMatch(/\.Config\.Env|\.env['"]|\.signInWithPassword\(|\.inviteUserByEmail\(/);
  expect(source).toContain("F06BROWSER0511:'f06-browser0511@example.invalid'");
  expect(source).toContain("F06BROWSER0512:'f06-browser0512@example.invalid'");
  expect(source).toContain('assert.ok(Object.hasOwn(actors, marker))');
  expect(source).toContain("path.join(privateParent, 'browser-acceptance-actor-' + marker)");
});
it('reserves private evidence durably before any external write and disallows repeats',()=>{
  for(const value of ["fs.existsSync(privateDir), false", "fs.mkdirSync(privateDir, {mode:0o700})",
    "fs.openSync(journalFile, 'ax', 0o600)", "fs.openSync(file, 'wx', 0o600)", 'fs.fsyncSync(fd)',
    'command+\'-attempt-private.json\'', 'credentials-private.json', 'previousEventHash',
    'reservation.helperSha256, helperSha256', 'ALGT_F06_BROWSER_PASSWORD',
    'password.length >= 24', "lower(email)=", "notes=${q(marker)}"]) expect(source).toContain(value);
  expect(source.indexOf('exclusive(credentialsFile, reservation)')).toBeLessThan(source.indexOf('admin.auth.admin.createUser('));
  for(const [intent,write] of [["append('auth-create-intent'",'const created = await'],
    ["append('profile-and-assignment-intent'",'const written = JSON.parse(sql('],
    ["append('auth-ban-intent'",'const banned = await'],
    ["append('exact-retirement-intent'",'const result = JSON.parse(sql(']]) expect(source.indexOf(intent)).toBeLessThan(source.indexOf(write));
  expect(source).not.toMatch(/rmSync|renameSync|writeFileSync/);
  expect(source.match(/fs\.unlinkSync\(/g)).toHaveLength(1);
  expect(source).toContain('fs.unlinkSync(lockFile)');
  expect(source).toContain('assert.equal(lock.nonce,lockNonce)');
  expect(source).toContain('preparedEvents[0].details.receiptSha256');
  expect(source).toContain("const privateParent = path.join(runtime, 'browser-acceptance-private')");
  expect(source).toContain('fs.lstatSync(privateParent).isSymbolicLink(), false');
});
it('uses only the ledger-owned existing global role and one new assignment',()=>{
  for(const value of ['ledger.actors.admin.roleId','ledger.companyIds[0]','ledger.rows.some',
    "role_code='system_admin'", "role_name='F06 synthetic admin'", "company_code='F06_A'",
    'ledger.productionRowsCopied, 0', 'bootstrap.assignments.length, 0',
    'insert into public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)',
    'values(${profileId},${owner.roleId},null,null,true)', "status='active',must_change_password=false",
    'email_confirm:true', 'app_metadata:{f06_marker:marker}']) expect(source).toContain(value);
  expect(source).not.toMatch(/(?:insert into|update|delete from) public\.(?:roles|permissions|role_permissions)\b/i);
  expect(source).not.toMatch(/\b(?:create|alter|drop)\s+(?:role|table|function)|\bgrant\s|\brevoke\s/i);
});
it('tracks owned sessions without tokens and preserves all other baseline identities',()=>{
  for(const value of ['preserved(original.preservedBaseline, before, true)', 'preserved(before, projection(reservation.authId))',
    "['profiles','assignments','roles','permissions','rolePermissions','authIdentities','authProviderIdentities']",
    "['sessions','refreshIdentities']", 'assert.deepEqual(after[key][id], identity)',
    'owned-browser-sessions-observed', "assert.ok(state.sessions.length > 0", 'session.userId,reservation.authId']) expect(source).toContain(value);
  expect(source).not.toMatch(/access_token|refresh_token:|select\s+\*\s+from\s+auth\.|encrypted_password|identity_data/);
});
it('retires exactly its assignment/profile/sessions while retaining history and account',()=>{
  for(const value of ["ban_duration:'876000h'", 'assert.equal(state.auth.banned, true)',
    "update public.user_roles set is_active=false where id=${prepared.assignmentId}",
    "update public.user_profiles set status='inactive' where id=${prepared.profileId}",
    'delete from auth.refresh_tokens where user_id=${q(reservation.authId)} and id in (${rid})',
    'delete from auth.sessions where user_id=${q(reservation.authId)}::uuid and id in (${sid})',
    'assertOwned(state, prepared, true)', 'state.sessions.length, 0', 'state.refreshIds.length, 0']) expect(source).toContain(value);
  expect(source).toContain('assert.deepEqual([...result.removedSessionIds].sort(), [...sessionIds].sort())');
  expect(source).not.toMatch(/delete from (?:auth\.users|public\.user_profiles|public\.user_roles)|\.deleteUser\(|\.signOut\(/);
});
it('bounds commands and API calls and never forwards credentials or raw failures',()=>{
  for(const value of ['timeout = 15000', "statement_timeout='20s'", "lock_timeout='5s'",
    "transaction_timeout='30s'", 'input, 35000', 'AbortSignal.timeout(15000)', "redirect:'error'",
    'shell:false', "killSignal:'SIGTERM'", 'maxBuffer:4*1024*1024',
    "['--config', dockerConfig, '--host', dockerHost, ...args]", 'url.origin, apiUrl',
    'providersOff()', 'noAutomaticRetry:true', "state:'FAIL_RETAINED'", "state:'PASS_LOCAL_ACTOR_ONLY'"]) expect(source).toContain(value);
  expect(source).not.toContain('...process.env');
  expect(source).not.toMatch(/console\.(?:log|error)|process\.(?:stdout|stderr)\.write\((?:password|keys|reservation|created|banned|error|result)/);
  expect(source).not.toMatch(/['"](?:pull|restart|start|stop|remove|prune)['"]\s*[,\]]/);
});
