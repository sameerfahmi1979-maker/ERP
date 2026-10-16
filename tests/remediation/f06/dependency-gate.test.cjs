'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { REVIEWED, validateAudit, validateProof, verifyHash } = require('../../../tooling/security/dependency-gate.cjs');

const leaf = () => ({ source: 1240992, name: 'braces', dependency: 'braces', severity: 'high', url: REVIEWED.advisoryUrl, range: '<=3.0.3' });
const entry = (name, severity, via) => ({ name, severity, via, nodes: [`node_modules/${name}`], range: '*' });
const report = () => ({ auditReportVersion: 2, vulnerabilities: {
  braces: entry('braces', 'high', [leaf()]),
  micromatch: entry('micromatch', 'high', ['braces']),
  'fast-glob': entry('fast-glob', 'high', ['micromatch']),
  'sprintf-js': entry('sprintf-js', 'moderate', [{ source: 42, name: 'sprintf-js', dependency: 'sprintf-js', severity: 'moderate', url: 'https://github.com/advisories/another', range: '*' }])
}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 3, critical: 0, total: 4 } } });
const validate = (value, exit = 1) => validateAudit(value, exit, ['node_modules/braces']);
const recount = value => {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  for (const item of Object.values(value.vulnerabilities)) { counts[item.severity]++; counts.total++; }
  value.metadata.vulnerabilities = counts;
  return value;
};

test('only reviewed braces leaf and exclusively derived high chains pass; moderate remains visible', () => {
  assert.deepEqual(validate(report()).counts, { info: 0, low: 0, moderate: 1, high: 3, critical: 0 });
});
for (const field of ['source', 'name', 'dependency', 'url', 'range', 'severity']) {
  test(`changed braces advisory ${field} fails`, () => {
    const value = report(); value.vulnerabilities.braces.via[0][field] = field === 'source' ? 999 : 'different';
    assert.throws(() => validate(value));
  });
}
test('additional braces advisory fails rather than suppressing package findings', () => {
  const value = report(); value.vulnerabilities.braces.via.push({ ...leaf(), source: 1240993, url: 'https://github.com/advisories/other' });
  assert.throws(() => validate(value), /unremediated high/);
});
for (const severity of ['high', 'critical']) {
  test(`unexpected ${severity} elsewhere fails`, () => {
    const value = report(); value.vulnerabilities.other = entry('other', severity, [{ ...leaf(), name: 'other', dependency: 'other' }]);
    assert.throws(() => validate(recount(value)), /unremediated/);
  });
}
test('mixed high chain with an unrelated moderate leaf fails', () => {
  const value = report(); value.vulnerabilities['fast-glob'].via.push('sprintf-js');
  assert.throws(() => validate(value), /unremediated high/);
});
test('downgrading an entry cannot hide a high advisory', () => {
  const value = report(); value.vulnerabilities.braces.severity = 'low';
  assert.throws(() => validate(recount(value)), /severity contradicts/);
});
test('downgrading a parent cannot hide inherited high severity', () => {
  const value = report(); value.vulnerabilities['fast-glob'].severity = 'low';
  assert.throws(() => validate(recount(value)), /severity contradicts/);
});
test('missing graph node fails', () => {
  const value = report(); value.vulnerabilities.micromatch.via = ['missing'];
  assert.throws(() => validate(value), /missing audit dependency/);
});
test('graph cycle fails', () => {
  const value = report(); value.vulnerabilities.braces.via.push('fast-glob');
  assert.throws(() => validate(value), /cyclic audit dependency/);
});
for (const mutation of [
  value => { value.error = { code: 'NETWORK' }; },
  value => { delete value.metadata; },
  value => { delete value.vulnerabilities.braces.via; },
  value => { value.vulnerabilities.braces.via = []; },
  value => { value.vulnerabilities.braces.via = [null]; },
  value => { value.vulnerabilities.braces.nodes = []; },
  value => { value.vulnerabilities.braces.name = 'renamed'; },
  value => { value.metadata.vulnerabilities.high = 0; },
  value => { value.auditReportVersion = 1; }
]) {
  test('malformed, missing or contradictory report fails', () => {
    const value = report(); mutation(value); assert.throws(() => validate(value));
  });
}
test('unverified advisory installation fails', () => {
  const value = report(); value.vulnerabilities.braces.nodes.push('node_modules/other/node_modules/braces');
  assert.throws(() => validate(value), /unverified/);
});
test('abnormal/contradictory audit exit fails', () => {
  for (const exit of [null, 2, 0]) assert.throws(() => validate(report(), exit));
});
test('reviewed bytes pass and hash drift fails', () => {
  const bytes = Buffer.from('reviewed'); const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.doesNotThrow(() => verifyHash(bytes, digest, 'test'));
  assert.throws(() => verifyHash(Buffer.from('drift'), digest, 'test'), /mismatch/);
});
const proof = () => ({ runId: 'current-run', target: 'node_modules/braces', node: 'v22.23.2', testSha256: REVIEWED.testSha256, goldenSha256: REVIEWED.goldenSha256, status: 0, tests: 66, passed: 66, failed: 0 });
const expected = { runId: 'current-run', target: 'node_modules/braces' };
test('current complete security proof passes', () => assert.doesNotThrow(() => validateProof(proof(), expected)));
for (const [field, replacement] of [['runId', 'stale-run'], ['target', 'wrong-copy'], ['node', 'v26.0.0'], ['testSha256', 'drift'], ['goldenSha256', 'drift'], ['status', 1], ['tests', 65], ['passed', 65], ['failed', 1]]) {
  test(`stale or incomplete security proof ${field} fails`, () => {
    const value = proof(); value[field] = replacement; assert.throws(() => validateProof(value, expected), /security proof/);
  });
}
