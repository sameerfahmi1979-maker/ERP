// Imports only the pure OID contract, never the actual replay helper.
import {expect, it} from 'vitest';
import {canonicalPgOid} from './candidate-replay-oid.mjs';

it('reproduces the PostgreSQL string OID failure and accepts its exact identity', () => {
  const identity = Object.freeze({name: 'synthetic_clone', oid: '90018', owner: 'synthetic_owner', allowConnections: true});
  expect(Number.isInteger(identity.oid)).toBe(false);
  const before = JSON.stringify(identity);
  expect(canonicalPgOid(identity.oid)).toBe('90018');
  expect(canonicalPgOid(90018)).toBe(canonicalPgOid(identity.oid));
  expect(canonicalPgOid('90019')).not.toBe(canonicalPgOid(identity.oid));
  expect(JSON.stringify(identity)).toBe(before);
  expect(identity.oid).toBe('90018');
});

it.each([1, '1', 90018, '90018', 4294967295, '4294967295'])('accepts exact positive OID %s', value => {
  expect(canonicalPgOid(value)).toBe(String(value));
});

it.each([
  0, -0, -1, 1.5, NaN, Infinity, -Infinity, 4294967296, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1,
  '', '0', '00', '01', '090018', '-1', '+1', ' 1', '1 ', '1\n', '1.0', '1e3', '0x10',
  '4294967296', '9007199254740991', '9007199254740993', '９００１８',
  null, undefined, true, false, BigInt(90018), [], {}, {toString: () => '90018'},
].map(value => ({value})))('rejects malformed, coercible or out-of-range value %#', ({value}) => {
  expect(() => canonicalPgOid(value)).toThrow();
});

it('never invokes object coercion or silently equates adjacent identities', () => {
  const value = {toString: () => { throw Error('Must not coerce'); }, valueOf: () => { throw Error('Must not coerce'); }};
  expect(() => canonicalPgOid(value)).toThrow(/Expected PostgreSQL OID number or decimal string/);
  expect(canonicalPgOid('4294967294')).not.toBe(canonicalPgOid('4294967295'));
});
