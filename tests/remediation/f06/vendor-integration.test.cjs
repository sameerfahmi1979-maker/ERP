'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REVIEWED, verifyVendorPatches } = require('../../../tooling/security/verify-vendor-patches.cjs');
const root = path.resolve(__dirname, '../../..');
const evidence = path.join(root, '.security-evidence');

function fixture() {
  fs.mkdirSync(evidence, { recursive: true });
  const target = fs.mkdtempSync(path.join(evidence, 'vendor-guards-'));
  const copy = relative => {
    fs.mkdirSync(path.dirname(path.join(target, relative)), { recursive: true });
    fs.cpSync(path.join(root, relative), path.join(target, relative), { recursive: true });
  };
  fs.writeFileSync(path.join(target, 'package.json'), '{"private":true}');
  const actual = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  const packages = {};
  for (const [name, item] of Object.entries(REVIEWED)) {
    for (const relative of [item.artifact, item.provenance, 'vendor/' + name + '-artifact.json', 'vendor/' + name, 'node_modules/' + name]) copy(relative);
    packages['node_modules/' + name] = actual.packages['node_modules/' + name];
  }
  fs.writeFileSync(path.join(target, 'package-lock.json'), JSON.stringify({ packages }));
  for (const caller of ['micromatch', 'mammoth/node_modules/argparse']) {
    const directory = path.join(target, 'node_modules', caller);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.js'), 'module.exports = {};');
  }
  // braces executes its original fill-range dependency for ordinary module loading.
  for (const name of ['fill-range', 'to-regex-range', 'is-number']) copy('node_modules/' + name);
  return target;
}
function check(mutate, expected) {
  const target = fixture();
  try {
    mutate(target);
    if (expected) assert.throws(() => verifyVendorPatches(target), expected);
    else assert.equal(verifyVendorPatches(target).wideAstBudget, 131072);
  } finally {
    assert.equal(path.dirname(target), evidence);
    assert.ok(path.basename(target).startsWith('vendor-guards-'));
    fs.rmSync(target, { recursive: true });
  }
}
test('both immutable archives preserve their source, installed consumer and behavior proofs', () => check(() => {}));
for (const name of Object.keys(REVIEWED)) {
  test(name + ' artifact mutation fails', () => check(root => fs.appendFileSync(path.join(root, REVIEWED[name].artifact), 'drift'), /artifact integrity/));
  test(name + ' provenance mutation fails', () => check(root => fs.appendFileSync(path.join(root, REVIEWED[name].provenance), ' '), /provenance/));
  test(name + ' metadata mutation fails', () => check(root => {
    const file = path.join(root, 'vendor', name + '-artifact.json');
    const value = JSON.parse(fs.readFileSync(file)); value.integrity = 'unreviewed';
    fs.writeFileSync(file, JSON.stringify(value));
  }, /metadata/));
  test(name + ' lock source mutation fails', () => check(root => {
    const file = path.join(root, 'package-lock.json');
    const value = JSON.parse(fs.readFileSync(file)); value.packages['node_modules/' + name].resolved = 'https://registry.invalid/unreviewed.tgz';
    fs.writeFileSync(file, JSON.stringify(value));
  }, /lock entry/));
  test(name + ' installed mutation fails', () => check(root => fs.appendFileSync(path.join(root, 'node_modules', name, 'package.json'), ' '), /source mismatch/));
  test(name + ' unexpected source file fails', () => check(root => fs.writeFileSync(path.join(root, 'vendor', name, 'unreviewed.js'), 'module.exports = {};'), /vendor source/));
  test(name + ' unexpected installed file fails', () => check(root => fs.writeFileSync(path.join(root, 'node_modules', name, 'unreviewed.js'), 'module.exports = {};'), /installed vendor files/));
  test(name + ' hidden untracked nested copy fails', () => check(root => {
    const destination = path.join(root, 'node_modules/micromatch/node_modules', name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(path.join(root, 'node_modules', name), destination, { recursive: true });
  }, /copies differ/));
}
