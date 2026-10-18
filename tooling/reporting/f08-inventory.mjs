import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Source-only inventory. Never imports application modules, reads env files,
// contacts providers, starts workers or treats static references as runtime proof.
const root = process.cwd();
const output = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !/^C:\\dev\\/i.test(output)) throw new Error('An explicit evidence path under C:/dev is required.');
const walk = folder => fs.existsSync(folder) ? fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
  const name = path.join(folder, entry.name);
  return entry.isDirectory() ? walk(name) : /\.(ts|tsx|mts)$/.test(name) ? [name] : [];
}) : [];
const source = walk(path.join(root, 'src')).map(file => ({ file, relative: path.relative(root, file).replaceAll('\\', '/'), text: fs.readFileSync(file, 'utf8') }));
const areas = [
  ['fixed-definitions', 'src/lib/official-documents/', 'RETAIN_REPAIR', 'Fixed versioned wording and canonical layout; no unapproved text activation.'],
  ['issuance', 'src/lib/output/', 'RETAIN_REPAIR', 'Canonical identity, class policy and durable issuance; preserve existing originals.'],
  ['output-actions', 'src/server/actions/output/', 'RETAIN_REPAIR', 'Fresh subject scope, checked transitions, original reprint and safe operations.'],
  ['pdf', 'src/lib/pdf/', 'RETAIN_REPAIR', 'Private rendering and immutable storage; validate actual bytes.'],
  ['export', 'src/lib/export/', 'CONSOLIDATE_REPAIR', 'Typed extracts distinct from official issues; shared safety between adapters.'],
  ['report-center', 'src/lib/report-center/', 'RETAIN_REPAIR', 'Scoped complete reads and governed brands; scheduling behavior belongs to F09.'],
  ['reports', 'src/server/actions/reports/', 'RETAIN_REPAIR', 'Review each actual fetcher/caller; no current-page export truncation.'],
  ['executive-layout', 'src/lib/executive-ledger/', 'RETAIN_DEPENDENCY', 'Shared layout still referenced; do not delete with old editors.'],
  ['legacy-designer', 'src/lib/report-designer/', 'RETAIN_DEPENDENCY_REVIEW', 'Shared schemas, governance and field registries are not blanket-retired.'],
  ['legacy-studio', 'src/lib/template-studio/', 'DISABLED_EDITOR_RETAIN_COMPATIBILITY', 'Historical/shared adapters are not an approved editor reinstallation.'],
  ['report-ui', 'src/features/report-center/', 'RETAIN_REPAIR', 'Simple selectors, fixed-template catalogue, drafts and plain action names.'],
  ['employee-output-ui', 'src/features/hr/employees/employee-letters-forms.tsx', 'RETAIN_REPAIR', 'Compact embedded history and scoped fixed letters/forms.'],
  ['public-verification', 'src/lib/public-verification/', 'RETAIN_REPAIR', 'Output-specific disclosure and authoritative parent validity.'],
  ['output-routes', 'src/app/api/output/', 'RETAIN_REPAIR', 'Fresh per-download scope and original integrity.'],
];
const entries = source.flatMap(item => {
  const area = areas.find(([, prefix]) => item.relative.startsWith(prefix));
  if (!area) return [];
  const references = source.flatMap(caller => caller.text.split(/\r?\n/).flatMap((line, index) => {
    const module = '@/' + item.relative.slice(4).replace(/\.(tsx?|mts)$/, '');
    return line.includes(module) ? [{ path: caller.relative, line: index + 1 }] : [];
  }));
  return [{ id: 'F08-SRC-' + createHash('sha256').update(item.relative).digest('hex').slice(0, 12), path: item.relative,
    sha256: createHash('sha256').update(fs.readFileSync(item.file)).digest('hex'), area: area[0], decision: area[2], rationale: area[3], references,
    evidence: 'STATIC_SOURCE_ONLY; relative imports, dynamic dispatch and live DB registrations require separate reconciliation' }];
});
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ state: 'SOURCE_INVENTORY_NOT_PHASE_ACCEPTANCE', at: new Date().toISOString(), root,
  base: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']), entries,
  limits: ['Source-only references do not prove live registry use or runtime adoption.', 'No deletion/retirement performed.', 'F09 worker/delivery acceptance excluded.'] }, null, 2), { flag: 'wx' });
console.log(`Recorded ${entries.length} source entries; no services started or production changes made.`);
