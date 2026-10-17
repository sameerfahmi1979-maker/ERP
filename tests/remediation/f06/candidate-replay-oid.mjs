// Pure value contract only. No runtime, database, filesystem or process access.
import assert from 'node:assert/strict';

// PostgreSQL oid is unsigned 32-bit. Zero is not a valid live object identity.
// Return a comparison key without changing the original observed identity.
export function canonicalPgOid(value) {
  if (typeof value === 'number') {
    assert.ok(Number.isSafeInteger(value) && value > 0 && value <= 4294967295, 'Expected positive PostgreSQL OID');
    return value.toString(10);
  }
  assert.equal(typeof value, 'string', 'Expected PostgreSQL OID number or decimal string');
  assert.match(value, /^[1-9][0-9]{0,9}$/, 'Expected canonical positive PostgreSQL OID decimal string');
  assert.ok(Number(value) <= 4294967295, 'PostgreSQL OID exceeds unsigned 32-bit range');
  assert.equal(Number(value).toString(10), value, 'Expected exact canonical PostgreSQL OID decimal string');
  return value;
}
