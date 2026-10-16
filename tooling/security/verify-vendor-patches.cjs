'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

const REVIEWED = Object.freeze({
  braces: {
    artifact: 'vendor/braces-3.0.3-algt-integrated-2.tgz',
    artifactSha256: '3b42ddbff088317a60e6f10e14f907fff6cb7db5b14d9204cf63534d573339ee',
    integrity: 'sha512-46Juc7zI9zpC2E4z4tIkfLZy0UdI7w2ORkcS8pH/wGyEEMZUtThi9mtREcx68G6Tv+H1U4d1c7KR0UWFiT/Pqw==',
    provenance: 'vendor/braces/PROVENANCE.json',
    provenanceSha256: '59dc07d3b7e125692206b9dbbc9f636544cc9a3e6e7df83227eac698c4c459ce',
    version: '3.0.3', caller: 'micromatch'
  },
  'sprintf-js': {
    artifact: 'vendor/sprintf-js-1.0.3-algt.1.tgz',
    artifactSha256: '06a933e90dfbbcc5d80d90f377efb333d48e1025626276c48a20b2ee0b77cc5f',
    integrity: 'sha512-qDxl7KBVdDAgO3olB8iDWggwNA3O4xJvs+/jOGfkPo54JKfZ+rGjwiifQ4PPrvjci5/+wOw6Y3GGZHHnRNTJpg==',
    provenance: 'vendor/PATCH-MANIFEST.json',
    provenanceSha256: '17827374ccd33b2c3c4261ca6f9493a5299c094d097a7b0dfbc4ef49c8d51304',
    version: '1.0.3-algt.1', caller: 'mammoth/node_modules/argparse'
  }
});
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw Error(message); };
function filesBelow(root, base) {
  const found = [];
  const walk = relative => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = relative + '/' + entry.name;
      if (entry.isSymbolicLink()) fail('Vendor verification does not accept symlinks: ' + name);
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) found.push(name.slice(base.length + 1));
      else fail('Unexpected vendor file kind: ' + name);
    }
  };
  walk(base);
  return found.sort();
}

function verifyVendorPatches(root = path.resolve(__dirname, '../..')) {
  root = fs.realpathSync(root);
  const read = relative => fs.readFileSync(path.join(root, relative));
  const lock = JSON.parse(read('package-lock.json'));
  const fromRoot = createRequire(path.join(root, 'package.json'));
  const discovered = Object.fromEntries(Object.keys(REVIEWED).map(name => [name, []]));
  const visited = new Set();
  const scan = directory => {
    if (!fs.existsSync(directory)) return;
    const real = fs.realpathSync(directory);
    if (!real.startsWith(root + path.sep) || visited.has(real)) fail('Vendor dependency traversal escapes checkout or cycles');
    visited.add(real);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.bin') continue;
      const packageRoot = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail('Vendor dependency traversal rejects links');
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('@')) { scan(packageRoot); continue; }
      const manifest = path.join(packageRoot, 'package.json');
      if (fs.existsSync(manifest)) {
        const name = JSON.parse(fs.readFileSync(manifest)).name;
        if (Object.hasOwn(discovered, name)) discovered[name].push(path.relative(root, packageRoot).split(path.sep).join('/'));
      }
      scan(path.join(packageRoot, 'node_modules'));
    }
  };
  scan(path.join(root, 'node_modules'));
  const installed = {};
  for (const [name, expected] of Object.entries(REVIEWED)) {
    const bytes = read(expected.artifact);
    if (hash(bytes) !== expected.artifactSha256 || 'sha512-' + crypto.createHash('sha512').update(bytes).digest('base64') !== expected.integrity) fail('Vendor artifact integrity mismatch: ' + name);
    if (hash(read(expected.provenance)) !== expected.provenanceSha256) fail('Vendor source provenance mismatch: ' + name);
    const metadata = JSON.parse(read('vendor/' + name + '-artifact.json'));
    for (const [key, value] of Object.entries({ artifact: expected.artifact, sha256: expected.artifactSha256, integrity: expected.integrity, package: name, version: expected.version, provenance: expected.provenance })) {
      if (metadata[key] !== value) fail('Vendor artifact metadata mismatch: ' + name + '/' + key);
    }
    const provenance = JSON.parse(read(expected.provenance));
    const sourceFiles = name === 'braces' ? provenance.patchedFiles : Object.fromEntries(Object.entries(provenance.patchedFiles).map(([file, digest]) => [file.replace('vendor/sprintf-js/', ''), digest]));
    const sourceRoot = 'vendor/' + name;
    const actualSource = filesBelow(root, sourceRoot).filter(file => name !== 'braces' || file !== 'PROVENANCE.json');
    if (JSON.stringify(actualSource) !== JSON.stringify(Object.keys(sourceFiles).sort())) fail('Unexpected or missing vendor source: ' + name);
    for (const [file, digest] of Object.entries(sourceFiles)) {
      if (hash(read(sourceRoot + '/' + file)) !== digest) fail('Vendor source integrity mismatch: ' + name + '/' + file);
    }
    const copies = Object.entries(lock.packages).filter(([entry, value]) => entry === 'node_modules/' + name || entry.endsWith('/node_modules/' + name) || value.name === name);
    if (!copies.length) fail('Missing patched dependency: ' + name);
    if (JSON.stringify(discovered[name].sort()) !== JSON.stringify(copies.map(([entry]) => entry).sort())) fail('Installed vendor copies differ from reviewed lock: ' + name);
    installed[name] = [];
    for (const [entry, value] of copies) {
      if (!entry.startsWith('node_modules/') || value.link || value.version !== expected.version || value.resolved !== 'file:' + expected.artifact || value.integrity !== expected.integrity) fail('Unreviewed vendor lock entry: ' + entry);
      const absolute = path.join(root, entry);
      if (fs.lstatSync(absolute).isSymbolicLink()) fail('Installed vendor must be materialized: ' + entry);
      if (JSON.stringify(filesBelow(root, entry)) !== JSON.stringify(Object.keys(sourceFiles).sort())) fail('Unexpected installed vendor files: ' + entry);
      for (const [file, digest] of Object.entries(sourceFiles)) {
        if (hash(read(entry + '/' + file)) !== digest) fail('Installed vendor source mismatch: ' + entry + '/' + file);
      }
      installed[name].push(entry);
    }
    const resolved = fs.realpathSync(fromRoot.resolve(name));
    if (!resolved.startsWith(path.join(root, 'node_modules', name) + path.sep)) fail('Unpatched root resolution: ' + name);
    const fromCaller = createRequire(fromRoot.resolve(expected.caller));
    if (fs.realpathSync(fromCaller.resolve(name)) !== resolved) fail('Unpatched nested consumer: ' + name);
  }
  // Fresh behavior checks supplement hashes; F06's unchanged 66-case golden proof
  // and every PERF security case still execute independently in CI.
  const braces = fromRoot('braces');
  const controlled = action => assert.throws(action, error => error instanceof RangeError && error.code === 'ERR_BRACES_NODE_LIMIT');
  const wide = { type: 'root', nodes: Array.from({ length: 131073 }, () => ({ type: 'text', value: 'a' })) };
  for (const method of ['compile', 'expand', 'stringify']) controlled(() => braces[method](wide));
  const { sprintf } = fromRoot('sprintf-js');
  for (const format of ['e', 'f', 'g']) assert.equal(sprintf('%.1000000000' + format, 1.25), sprintf('%.100' + format, 1.25));
  return { installed, sourceAndInstalledBytes: 'verified', wideAstBudget: 131072, sprintfPrecisionCeiling: 100, upstreamAuditIsNotPatchVerification: true };
}

module.exports = { REVIEWED, verifyVendorPatches };
if (require.main === module) console.log(JSON.stringify(verifyVendorPatches()));
