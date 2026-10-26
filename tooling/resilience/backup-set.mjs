import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, realpath, readdir } from 'node:fs/promises';
import path from 'node:path';

const fail = message => { throw new Error(message); };
const hashPattern = /^[a-f0-9]{64}$/;
const components = ['database', 'storage', 'auth', 'permissions', 'originals', 'pendingOperations', 'configuration', 'renderer'];

/** Recovery evidence is a coordinated set, not a database-backup checkbox.
 * Deliberately laboratory-only: this tool cannot authorize a live restore. */
export function validateBackupSet(manifest) {
  if (manifest?.version !== 1 || manifest.scope !== 'synthetic-laboratory') fail('Unsupported backup scope');
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit ?? '')) fail('Immutable source commit required');
  if (!Number.isFinite(Date.parse(manifest.cutoff ?? ''))) fail('Recovery cutoff required');
  if (!Array.isArray(manifest.artifacts) || !manifest.artifacts.length || manifest.artifacts.length > 100000) fail('Invalid artifact list');
  const paths = new Set();
  for (const artifact of manifest.artifacts) {
    if (!['database', 'object', 'configuration'].includes(artifact.kind)) fail('Invalid artifact kind');
    const name = artifact.path;
    if (typeof name !== 'string' || !name || /[\\:\x00-\x1f]/.test(name) || name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..')) fail('Unsafe artifact path');
    const canonical = name.toLowerCase();
    if (paths.has(canonical)) fail('Duplicate artifact path');
    paths.add(canonical);
    if (!hashPattern.test(artifact.sha256) || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0) fail('Invalid artifact integrity');
  }
  if (manifest.artifacts.filter(a => a.kind === 'database').length !== 1) fail('Exactly one database archive required');
  if (!manifest.artifacts.some(a => a.kind === 'object')) fail('Object bytes are required; database backups do not contain them');
  if (!manifest.artifacts.some(a => a.kind === 'configuration')) fail('Sanitized configuration inventory required');
  if (!Array.isArray(manifest.secretReferences) || manifest.secretReferences.some(s => typeof s !== 'string' || !/^[A-Z][A-Z0-9_]{1,100}$/.test(s))) fail('Only secret reference names are permitted');
  for (const component of components) {
    if (!['verified', 'pending', 'not-applicable'].includes(manifest.coverage?.[component])) fail('Missing recovery coverage: ' + component);
  }
  // A successful hash verification cannot silently convert untested components
  // or owner decisions into approved recovery objectives.
  return { completeCoverage: components.every(c => manifest.coverage[c] !== 'pending'), productionAccepted: false };
}

export async function fileIntegrity(filename) {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(filename)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: hash.digest('hex'), bytes };
}

export async function verifyBackupSet(directory, manifest) {
  const coverage = validateBackupSet(manifest);
  const root = await realpath(directory), verified = [];
  for (const artifact of manifest.artifacts) {
    let current = root;
    for (const part of artifact.path.split('/')) {
      current = path.join(current, part);
      if ((await lstat(current)).isSymbolicLink()) fail('Linked backup path rejected');
    }
    const absolute = await realpath(current), relative = path.relative(root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) fail('Backup escaped its directory');
    if (!(await lstat(absolute)).isFile()) fail('Backup artifact is not a regular file');
    const integrity = await fileIntegrity(absolute);
    if (integrity.bytes !== artifact.bytes || integrity.sha256 !== artifact.sha256) fail('Backup integrity mismatch: ' + artifact.path);
    verified.push({ path: artifact.path, ...integrity });
  }
  return { ...coverage, artifacts: verified, verifiedAt: new Date().toISOString() };
}

/** Exact object set catches missing files as well as an unexpected stale file.
 * Use only on the owned laboratory restore directory, never a live bucket. */
export async function verifyRestoredObjects(directory, manifest) {
  validateBackupSet(manifest);
  const expected = manifest.artifacts.filter(a => a.kind === 'object');
  const actual = [];
  async function walk(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) fail('Linked object rejected');
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative + '/');
      else if (entry.isFile()) actual.push(relative);
      else fail('Unsupported restored object');
    }
  }
  await walk(directory);
  const names = expected.map(a => a.path.replace(/^objects\//, '')).sort();
  if (JSON.stringify(actual.sort()) !== JSON.stringify(names)) fail('Restored object set mismatch');
  for (const object of expected) {
    if (!object.path.startsWith('objects/')) fail('Object prefix is required');
    const result = await fileIntegrity(path.join(directory, object.path.slice(8)));
    if (result.sha256 !== object.sha256 || result.bytes !== object.bytes) fail('Restored object integrity mismatch');
  }
  return { verifiedObjects: expected.length };
}
