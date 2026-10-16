// Pure extraction contract. Never opens files, starts processes or calls SQL.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const migrationSha256 = 'af63a8897a38aaf02485f659d29133bdab1f7b53a13e184b2bd087de3ffae31b';
export const signature = 'erp_private.ai_approval_destination_snapshot(jsonb)';
export const deniedRoles = Object.freeze(['anon', 'service_role']);
const sha = value => createHash('sha256').update(value).digest('hex');

export function exactDestinationDefinition(bytes) {
  assert.ok(Buffer.isBuffer(bytes), 'Expected held migration bytes');
  assert.equal(sha(bytes), migrationSha256, 'Candidate migration bytes changed');
  const source = bytes.toString('utf8');
  assert.equal(Buffer.compare(Buffer.from(source, 'utf8'), bytes), 0);
  const definitions = [...source.matchAll(/^create function erp_private\.ai_approval_destination_snapshot\(p_request jsonb\)\n[\s\S]*?^end \$\$;/gm)];
  assert.equal(definitions.length, 1);
  const definition = definitions[0][0];
  assert.ok(definition.startsWith("create function erp_private.ai_approval_destination_snapshot(p_request jsonb)\nreturns jsonb language plpgsql security definer set search_path='' as $$\ndeclare company jsonb; branch jsonb;\n"));
  assert.ok(!/%(?:rowtype|type)|check_function_bodies/i.test(definition));
  const owner = `alter function ${signature} owner to postgres;`;
  const revoke = `revoke all on function ${signature} from public,anon,service_role;`;
  const grant = `grant execute on function ${signature} to authenticated;`;
  for (const statement of [owner, revoke, grant]) assert.equal(source.split(statement).length, 2);
  const ddl = [definition, owner, revoke, grant].join('\n');
  assert.ok(source.includes(ddl), 'Exact contiguous function/owner/ACL block required');
  const body = definition.match(/as \$\$([\s\S]*)\$\$;$/)?.[1];
  assert.ok(body);
  return Object.freeze({definition, owner, revoke, grant, ddl, bodySha256: sha(body), ddlSha256: sha(ddl), migrationSha256});
}
