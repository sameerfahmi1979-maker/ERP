'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const F06 = 'cd23c1c73e0ca847a92d337e91bb1de131e17839';
const PERF = '581cf501890bb9a8b3116d4e5858d5efa58bf163';
const NEW_MIGRATION = '20261016092335_integration_f06_perf_template_selection.sql';
const root = path.resolve(__dirname, '../../../..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, {cwd: root, maxBuffer: 16 * 1024 * 1024});
function buildManifest() {
  const handoff = git('show', `${F06}:docs/remediation/F06/RELEASE_HANDOFF.md`).toString('utf8');
  const names = [...handoff.matchAll(/^\| \d+ \| `(\d{14}_[^`]+\.sql)` \|/gm)].map(match => match[1]);
  if (names.length !== 111 || new Set(names).size !== 111) throw Error('Expected exactly 26 predecessors and 85 reviewed F06 files');
  const perfNames = git('ls-tree', '-r', '--name-only', PERF, '--', 'supabase/migrations').toString('utf8').trim().split('\n')
    .filter(name => /\/\d{14}_perf_/.test(name)).map(name => path.posix.basename(name));
  if (perfNames.length !== 16) throw Error('Expected exactly 16 reviewed PERF migrations');
  const records = [...names.map((name, index) => ({name, group: index < 26 ? 'predecessor' : 'F06', commit: F06})),
    ...perfNames.map(name => ({name, group: 'PERF', commit: PERF}))].map(record => {
    const file = `supabase/migrations/${record.name}`, bytes = git('show', `${record.commit}:${file}`);
    if (record.group === 'predecessor' && !bytes.equals(git('show', `${PERF}:${file}`))) throw Error(`Predecessor lineage mismatch: ${record.name}`);
    return {...record, path: file, sha256: sha256(bytes), bytes: bytes.length, normalization: 'immutable Git blob; no newline transformation'};
  });
  const newFile = `supabase/migrations/${NEW_MIGRATION}`;
  const newText = fs.readFileSync(path.join(root, newFile), 'utf8').replace(/\r\n/g, '\n');
  if (/\r|\uFEFF/.test(newText)) throw Error('New migration contains a lone CR or BOM; review before publication');
  const newBytes = Buffer.from(newText, 'utf8');
  records.push({name: NEW_MIGRATION, group: 'composition', commit: null, path: newFile, sha256: sha256(newBytes), bytes: newBytes.length, normalization: 'candidate UTF8 canonical LF only; verify final Git blob before application'});
  records.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  if (new Set(records.map(record => record.name.slice(0, 14))).size !== records.length) throw Error('Duplicate migration version; no automatic reconciliation allowed');
  const ordered = records.map((record, index) => ({order: index + 1, ...record}));
  return {version: 1, kind: 'reviewed-chronological-source-manifest-not-application-receipt',
    source: {F06, PERF}, counts: {predecessor: 26, F06: 85, PERF: 16, composition: 1, total: 128},
    baseline: {required: 'separately verified F02 schema-only predecessor', automaticLegacyReplay: false},
    digest: sha256(ordered.map(record => `${record.name} ${record.sha256}\n`).join('')),
    applicationRules: ['Reconcile actual target history and catalog before execution.', 'Never reapply predecessors already present.',
      'Preserve exact chronological order; F06 and PERF timestamps interleave.', 'No guard relaxation, migration rewrite, main merge or deployment is authorized by this manifest.',
      'Run application/RLS/rollback acceptance on the exact combined source; a file hash is not native acceptance.'], migrations: ordered};
}
if (require.main === module) {
  const args = process.argv.slice(2), manifest = buildManifest();
  if (!args.length) process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  else if (args.length === 2 && args[0] === '--write') {
    const target = path.resolve(args[1]);
    const allowed = path.join(root, 'docs', 'integration', 'f00-f06', 'schema') + path.sep;
    if (!target.startsWith(allowed)) throw Error('Generated public manifest output must stay in this checkout schema docs folder');
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, {flag: 'wx'});
    console.log(JSON.stringify({path: target, digest: manifest.digest, counts: manifest.counts}));
  } else throw Error('Usage: node migration-manifest.cjs [--write <new schema-docs path>]');
}
module.exports = {buildManifest, sha256, NEW_MIGRATION, F06, PERF};
