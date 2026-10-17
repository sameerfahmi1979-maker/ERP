// Pure contract only. No actual-helper import, private receipt or runtime access.
import {expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {deniedRoles, exactDestinationDefinition, migrationSha256, signature} from './dms-destination-fixed-runtime-acl-contract.mjs';

const bytes = fs.readFileSync(path.resolve('supabase/migrations/20261004193518_f06_numbered_ai_intake_approval.sql'));
const source = bytes.toString('utf8');
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

it('extracts the unchanged candidate CREATE, owner and EXECUTE ACL block byte-for-byte', () => {
  const before = Buffer.from(bytes);
  const result = exactDestinationDefinition(bytes);
  expect(sha(bytes)).toBe(migrationSha256);
  expect(result.migrationSha256).toBe('af63a8897a38aaf02485f659d29133bdab1f7b53a13e184b2bd087de3ffae31b');
  expect(source).toContain(result.ddl);
  expect(result.ddl).toBe([result.definition, result.owner, result.revoke, result.grant].join('\n'));
  expect(result.definition).toMatch(/^create function erp_private\.ai_approval_destination_snapshot\(p_request jsonb\)\n/);
  expect(result.definition).toMatch(/end \$\$;$/);
  expect(result.owner).toBe(`alter function ${signature} owner to postgres;`);
  expect(result.revoke).toBe(`revoke all on function ${signature} from public,anon,service_role;`);
  expect(result.grant).toBe(`grant execute on function ${signature} to authenticated;`);
  expect(result.ddlSha256).toBe(sha(result.ddl));
  expect(result.bodySha256).toBe(sha(result.definition.split('as $$')[1].slice(0, -3)));
  expect(Object.isFrozen(result)).toBe(true);
  expect(bytes.equals(before)).toBe(true);
});

it('preserves the real unresolved application dependencies, never inventing substitutes', () => {
  const {definition, ddl} = exactDestinationDefinition(bytes);
  expect(definition).toContain('perform erp_private.validate_ai_approval_request(p_request,false);');
  expect(definition.match(/perform erp_private\.assert_ai_approval_authority\(p_request\);/g)).toHaveLength(2);
  expect(definition).toContain('from public.owner_companies c');
  expect(definition).toContain('from public.branches b');
  expect(definition).toContain('declare company jsonb; branch jsonb;');
  expect(definition).not.toMatch(/%rowtype|%type/i);
  expect(ddl.match(/^create function /gm)).toHaveLength(1);
  expect(ddl).not.toMatch(/create (?:table|schema|extension)|check_function_bodies/i);
});

it.each([
  ['body', source.replace("'Destination company unavailable'", "'Changed company error'")],
  ['owner', source.replace(`alter function ${signature} owner to postgres;`, `alter function ${signature} owner to authenticated;`)],
  ['execute grant', source.replace(`grant execute on function ${signature} to authenticated;`, `grant execute on function ${signature} to authenticated,service_role;`)],
  ['unrelated bytes', source + '\n-- unrelated candidate change\n'],
  ['line endings', source.replaceAll('\n', '\r\n')],
])('rejects a change to %s before extraction', (_name, changed) => {
  expect(() => exactDestinationDefinition(Buffer.from(changed))).toThrow('Candidate migration bytes changed');
});

it.each([undefined, null, source, new Uint8Array(bytes)])('requires held immutable-source bytes, not coerced input %#', value => {
  expect(() => exactDestinationDefinition(value)).toThrow('Expected held migration bytes');
});

it('restricts direct body probes to the two explicitly denied roles', () => {
  expect(deniedRoles).toEqual(['anon', 'service_role']);
  expect(Object.isFrozen(deniedRoles)).toBe(true);
  expect(deniedRoles).not.toContain('authenticated');
  expect(deniedRoles).not.toContain('postgres');
});

it('keeps the contract import pure with no file, process, database or network effects', () => {
  const contract = fs.readFileSync(path.resolve('tests/remediation/f06/dms-destination-fixed-runtime-acl-contract.mjs'), 'utf8');
  expect(contract.match(/^import .*$/gm)).toEqual([
    "import assert from 'node:assert/strict';",
    "import {createHash} from 'node:crypto';",
  ]);
  expect(contract).not.toMatch(/readFile|writeFile|spawn|execSync|fetch\(|process\.|import\(/);
});
