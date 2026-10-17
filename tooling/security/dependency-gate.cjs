'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REVIEWED = Object.freeze({
  artifact: 'vendor/braces-3.0.3-algt-integrated-2.tgz',
  artifactSha256: '3b42ddbff088317a60e6f10e14f907fff6cb7db5b14d9204cf63534d573339ee',
  provenance: 'vendor/braces/PROVENANCE.json',
  provenanceSha256: '59dc07d3b7e125692206b9dbbc9f636544cc9a3e6e7df83227eac698c4c459ce',
  test: 'tests/remediation/f06/braces-local-security.test.cjs',
  testSha256: '1fe41a70d613c1f0a14bff4b3cf6fc3c0f36e653f8c921ba6dc7dba35d5950c5',
  golden: 'tests/remediation/f06/braces-upstream-golden.json',
  goldenSha256: '69e1fc3fd15dd84133da8f7798751b6733962d635301cbdd29d4a8614666d375',
  node: 'v22.23.2',
  advisoryUrl: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
  advisorySource: 1240992,
  integrity: 'sha512-46Juc7zI9zpC2E4z4tIkfLZy0UdI7w2ORkcS8pH/wGyEEMZUtThi9mtREcx68G6Tv+H1U4d1c7KR0UWFiT/Pqw=='
});
const fail = message => { throw new Error(message); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const verifyHash = (bytes, expected, label) => {
  if (hash(bytes) !== expected) fail(`${label}: reviewed SHA-256 mismatch`);
};
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const levels = ['info', 'low', 'moderate', 'high', 'critical'];

function validateAudit(audit, rawExit, verifiedPaths) {
  if (![0, 1].includes(rawExit)) fail('audit command did not complete normally');
  if (!object(audit) || audit.error || audit.auditReportVersion !== 2 || !object(audit.vulnerabilities) || !object(audit.metadata?.vulnerabilities)) fail('audit report is missing, malformed or contains a registry/transport error');
  const graph = audit.vulnerabilities;
  const counts = Object.fromEntries(levels.map(level => [level, 0]));
  for (const [name, item] of Object.entries(graph)) {
    if (!object(item) || item.name !== name || !levels.includes(item.severity) || !Array.isArray(item.via) || !item.via.length || !Array.isArray(item.nodes) || !item.nodes.length || !item.nodes.every(node => typeof node === 'string') || typeof item.range !== 'string') fail(`malformed audit entry: ${name}`);
    counts[item.severity]++;
    for (const via of item.via) {
      if (typeof via === 'string') {
        if (!Object.hasOwn(graph, via)) fail(`missing audit dependency: ${name} -> ${via}`);
      } else if (!object(via) || !Number.isInteger(via.source) || typeof via.url !== 'string' || typeof via.range !== 'string' || !levels.includes(via.severity) || typeof via.name !== 'string' || typeof via.dependency !== 'string') fail(`malformed advisory leaf: ${name}`);
    }
  }
  for (const level of levels) if (audit.metadata.vulnerabilities[level] !== counts[level]) fail(`audit count mismatch: ${level}`);
  if (audit.metadata.vulnerabilities.total !== Object.keys(graph).length) fail('audit total count mismatch');
  if (rawExit === 0 && (counts.high || counts.critical)) fail('audit exit contradicts high/critical findings');
  const active = new Set();
  const memo = new Map();
  const ranks = new Map();
  const walk = name => {
    if (active.has(name)) fail(`cyclic audit dependency: ${name}`);
    if (memo.has(name)) return memo.get(name);
    active.add(name);
    const item = graph[name];
    let onlyReviewed = true;
    let descendantRank = 0;
    for (const via of item.via) {
      if (typeof via === 'string') {
        onlyReviewed = walk(via) && onlyReviewed;
        descendantRank = Math.max(descendantRank, ranks.get(via));
      } else {
        descendantRank = Math.max(descendantRank, levels.indexOf(via.severity));
        const reviewed = name === 'braces' && via.name === 'braces' && via.dependency === 'braces' && via.source === REVIEWED.advisorySource && via.url === REVIEWED.advisoryUrl && via.range === '<=3.0.3' && via.severity === 'high';
        if (reviewed && (!verifiedPaths.length || !item.nodes.every(node => verifiedPaths.includes(node)))) fail('advisory references an unverified braces installation');
        onlyReviewed = reviewed && onlyReviewed;
      }
    }
    if (levels.indexOf(item.severity) < descendantRank) fail(`audit severity contradicts descendant advisory: ${name}`);
    active.delete(name);
    memo.set(name, onlyReviewed);
    ranks.set(name, levels.indexOf(item.severity));
    return onlyReviewed;
  };
  for (const name of Object.keys(graph)) walk(name);
  for (const [name, item] of Object.entries(graph)) {
    if (item.severity === 'critical' || (item.severity === 'high' && !memo.get(name))) fail(`unremediated ${item.severity} dependency: ${name}`);
  }
  return { counts, retainedAdvisory: counts.high ? REVIEWED.advisoryUrl : null };
}

function validateProof(proof, expected) {
  if (!object(proof) || proof.runId !== expected.runId || proof.target !== expected.target || proof.node !== REVIEWED.node || proof.testSha256 !== REVIEWED.testSha256 || proof.goldenSha256 !== REVIEWED.goldenSha256 || proof.status !== 0 || proof.tests !== 66 || proof.passed !== 66 || proof.failed !== 0) fail('security proof is stale, incomplete, unreviewed or failed');
}

function verifyInstallation(root) {
  const read = name => fs.readFileSync(path.join(root, name));
  const artifact = read(REVIEWED.artifact);
  verifyHash(artifact, REVIEWED.artifactSha256, 'braces tarball');
  if ('sha512-' + crypto.createHash('sha512').update(artifact).digest('base64') !== REVIEWED.integrity) fail('braces tarball integrity mismatch');
  verifyHash(read(REVIEWED.provenance), REVIEWED.provenanceSha256, 'braces provenance');
  verifyHash(read(REVIEWED.test), REVIEWED.testSha256, 'security test');
  verifyHash(read(REVIEWED.golden), REVIEWED.goldenSha256, 'upstream golden');
  const metadata = JSON.parse(read('vendor/braces-artifact.json'));
  for (const [key, value] of Object.entries({ artifact: REVIEWED.artifact, sha256: REVIEWED.artifactSha256, integrity: REVIEWED.integrity, provenance: REVIEWED.provenance, provenanceSha256: REVIEWED.provenanceSha256, package: 'braces', version: '3.0.3', advisory: 'GHSA-vfj7-8cjw-p6xm', ceiling: 100, securityTest: REVIEWED.test, golden: REVIEWED.golden })) if (metadata[key] !== value) fail(`artifact metadata mismatch: ${key}`);
  const provenance = JSON.parse(read(REVIEWED.provenance));
  for (const [file, digest] of Object.entries(provenance.testFiles)) verifyHash(read('tests/remediation/f06/' + file), digest, file);
  const lock = JSON.parse(read('package-lock.json'));
  if (!object(lock.packages)) fail('lockfile package map missing');
  const locked = Object.entries(lock.packages).filter(([name, item]) => name === 'node_modules/braces' || name.endsWith('/node_modules/braces') || item.name === 'braces').map(([name, item]) => {
    if (!/^node_modules\//.test(name) || item.version !== '3.0.3' || item.resolved !== 'file:' + REVIEWED.artifact || item.integrity !== REVIEWED.integrity || item.link) fail(`unreviewed braces lock entry: ${name}`);
    return name;
  });
  if (!locked.length) fail('no reviewed braces lock entries');
  const installed = [];
  const seen = new Set();
  const scan = directory => {
    if (!fs.existsSync(directory)) return;
    const real = fs.realpathSync(directory);
    if (!real.startsWith(fs.realpathSync(root) + path.sep) || seen.has(real)) fail('dependency traversal escapes checkout or contains a cycle');
    seen.add(real);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.bin') continue;
      const packageRoot = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`dependency link cannot establish reviewed source: ${path.relative(root, packageRoot)}`);
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('@')) { scan(packageRoot); continue; }
      const manifest = path.join(packageRoot, 'package.json');
      if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest)).name === 'braces') installed.push(path.relative(root, packageRoot).split(path.sep).join('/'));
      scan(path.join(packageRoot, 'node_modules'));
    }
  };
  scan(path.join(root, 'node_modules'));
  if (JSON.stringify(installed.sort()) !== JSON.stringify(locked.sort())) fail('installed braces copies differ from reviewed lock entries');
  for (const target of installed) {
    for (const [file, digest] of Object.entries(provenance.patchedFiles)) verifyHash(read(target + '/' + file), digest, `${target}/${file}`);
    const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.relative(path.join(root, target), path.join(directory, entry.name)).split(path.sep).join('/')]);
    if (JSON.stringify(files(path.join(root, target)).sort()) !== JSON.stringify(Object.keys(provenance.patchedFiles).sort())) fail(`unexpected installed braces files: ${target}`);
  }
  return { installed, lockSha256: hash(read('package-lock.json')) };
}

function run(root = path.resolve(__dirname, '../..')) {
  const runId = crypto.randomUUID();
  const directory = path.join(root, '.security-evidence', new Date().toISOString().replace(/[:.]/g, '-') + '-' + runId);
  fs.mkdirSync(directory, { recursive: true });
  const evidence = { runId, startedAt: new Date().toISOString(), node: process.version, state: 'FAIL' };
  let rawAudit;
  try {
    if (process.version !== REVIEWED.node) fail('dependency gate requires pinned Node 22.23.2');
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') fail('audit cannot run with TLS verification disabled');
    const npm = process.env.npm_execpath || [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')].find(file => fs.existsSync(file));
    if (!npm || !fs.existsSync(npm)) fail('npm CLI path unavailable');
    evidence.npmVersion = JSON.parse(fs.readFileSync(path.resolve(path.dirname(npm), '../package.json'), 'utf8')).version;
    if (evidence.npmVersion !== '10.9.8') fail('dependency gate requires pinned npm 10.9.8');
    rawAudit = spawnSync(process.execPath, [npm, 'audit', '--json', '--audit-level=high', '--include=dev', '--include=optional', '--include=peer', '--strict-ssl=true'], { cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024, shell: false, windowsHide: true });
    fs.writeFileSync(path.join(directory, 'npm-audit.raw.json'), rawAudit.stdout || '');
    fs.writeFileSync(path.join(directory, 'npm-audit.stderr.txt'), rawAudit.stderr || '');
    evidence.rawAudit = { exit: rawAudit.status, signal: rawAudit.signal, error: rawAudit.error?.code || null, sha256: hash(Buffer.from(rawAudit.stdout || '')) };
    if (rawAudit.error || rawAudit.signal) fail('audit timed out or transport/process failed');
    const audit = JSON.parse(rawAudit.stdout);
    if (audit.error) fail('npm audit returned an error');
    // Compose the PERF precision/node budgets with F06's depth/cycle proof.
    // This checks immutable source, archive, lock and installed consumers.
    evidence.integratedVendorProof = require('./verify-vendor-patches.cjs').verifyVendorPatches(root);
    const installation = verifyInstallation(root);
    evidence.installation = installation;
    evidence.audit = validateAudit(audit, rawAudit.status, installation.installed);
    evidence.securityProofs = [];
    for (const [index, target] of installation.installed.entries()) {
      const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', REVIEWED.test], { cwd: root, env: { ...process.env, ALGT_F06_BRACES_PACKAGE_ROOT: path.join(root, target) }, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, shell: false, windowsHide: true });
      fs.writeFileSync(path.join(directory, `braces-security-${index}.tap`), (result.stdout || '') + (result.stderr || ''));
      if (result.error || result.signal) fail('fresh installed security test did not complete');
      const count = name => Number(result.stdout?.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] ?? NaN);
      const proof = { runId, target, node: process.version, testSha256: REVIEWED.testSha256, goldenSha256: REVIEWED.goldenSha256, status: result.status, tests: count('tests'), passed: count('pass'), failed: count('fail'), outputSha256: hash(Buffer.from(result.stdout || '')) };
      validateProof(proof, { runId, target });
      evidence.securityProofs.push(proof);
    }
    const finalInstallation = verifyInstallation(root);
    if (JSON.stringify(finalInstallation) !== JSON.stringify(installation)) fail('installed source or lock changed during security checks');
    if (JSON.stringify(require('./verify-vendor-patches.cjs').verifyVendorPatches(root)) !== JSON.stringify(evidence.integratedVendorProof)) fail('integrated vendor proof changed during security checks');
    evidence.state = 'PASS_VERIFIED_LOCAL_REMEDIATION_UPSTREAM_ADVISORY_RETAINED';
  } catch (error) { evidence.error = error.message; }
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(directory, 'dependency-gate.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ state: evidence.state, evidence: path.relative(root, directory).split(path.sep).join('/'), error: evidence.error || null, rawAuditExit: evidence.rawAudit?.exit ?? null }));
  return evidence.state.startsWith('PASS_') ? 0 : 1;
}

module.exports = { REVIEWED, validateAudit, validateProof, verifyHash, verifyInstallation, run };
if (require.main === module) process.exitCode = run();
