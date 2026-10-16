// Pure names only: safe to import in offline tests; no runtime/SQL dependencies.
import assert from 'node:assert/strict';

export function automaticReminderRaceNames(id) {
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
  const tag = 'f06-ar-' + id;
  const names = { tag, holder: tag + '-holder', contender: tag + '-contender' };
  // PostgreSQL's standard NAMEDATALEN includes the terminating byte. Keep the
  // exact observer identity rather than accidentally querying a truncated name.
  for (const name of Object.values(names)) assert.ok(Buffer.byteLength(name, 'utf8') <= 63);
  return names;
}
