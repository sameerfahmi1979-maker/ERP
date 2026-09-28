'use strict';
// Read-only generation: never applies migrations or repairs migration history.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const project = args.find(a => a.startsWith('--project-id='))?.slice(13);
if (!project || !/^[a-z]{20}$/.test(project) || args.some(a => a !== '--check' && a !== '--project-id=' + project)) {
  throw Error('Use node tooling/schema/generate-types.cjs --project-id=<approved-project-ref> [--check]');
}
const cliArgs = ['gen','types','--lang','typescript','--schema','public','--project-id',project];
const result = process.platform === 'win32'
  ? cp.spawnSync('pwsh.exe', ['-NoProfile','-NonInteractive','-Command', 'supabase ' + cliArgs.join(' ')], {encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024})
  : cp.spawnSync('supabase', cliArgs, {encoding:'utf8',maxBuffer:16*1024*1024});
if (result.status !== 0) throw Error('Supabase schema generation failed; output withheld to avoid leaking configuration');
const generated = result.stdout.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trimEnd() + '\n';
if (!generated.startsWith('export type Json =') || !generated.includes('export type Database =') || generated.includes('\0')) throw Error('Unexpected generator output');
const file = path.join(root,'src/types/database.ts');
if (check) {
  if (fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n') !== generated) throw Error('Generated schema drift; regenerate from the approved schema and review consumers');
  console.log('Generated schema matches the explicitly selected project.');
} else {
  fs.writeFileSync(file,generated,'utf8');
  console.log('Generated UTF-8 public-schema types; no database writes.');
}
