'use strict';
// Source-structure inventory, not a claim that every detected surface is tested.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const dir=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04/closure-20260928');
const rows=[];
function phase(file){
 if(/report|branding|letter/.test(file))return 'F08';
 if(/\/dms\//.test(file))return 'F07';
 if(/\/hr\/recruitment\//.test(file))return 'F12';
 if(/\/hr\/(leave|attendance|shift|calendar)/.test(file))return 'F13';
 if(/\/hr\/(payroll|salary|compensation|wps)/.test(file))return 'F15';
 if(/\/hr\/(separation|clearance|service)/.test(file))return 'F16';
 if(/\/hr\//.test(file))return /employee|employment/.test(file)?'F11':'F14';
 if(/notification/.test(file))return 'F10';
 if(/email|schedule/.test(file))return 'F09';
 if(/\/features\/|\/admin\//.test(file))return 'F06';
 return 'F05';
}
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,entry.name);if(entry.isDirectory()){walk(file);continue;}if(!file.endsWith('.tsx')||file.includes('.test.'))continue;
 const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),tags=new Set();
 function visit(node){if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){const name=node.tagName.getText(ast);if(name==='form'||/^(ERPRecordWorkspaceForm|ERPChildDialogForm|ERPDrawerForm|ReportTemplateSelectDialog)$/.test(name))tags.add(name);}ts.forEachChild(node,visit);}visit(ast);
 if(!tags.size&&!/useWorkspace(FormDraft|ControlledDraft|PageState|TableState)|usePersistentUiState/.test(source))continue;
 const relative=file.replaceAll('\\','/'),pilot=/\/(department|employee|candidate)-workspace-form.tsx$/.test(relative),owner=phase(relative);
 rows.push({file:relative,tags:[...tags],draft:source.includes('useWorkspaceControlledDraft')?'typed':source.includes('useWorkspaceFormDraft')?'legacy-explicit-fields':'no draft adapter asserted',pilot,task:pilot?'F04-PILOTS':`${owner}-WS-ADOPTION`,owner:pilot?'F04':owner});
}}
walk('src');rows.sort((a,b)=>a.file.localeCompare(b.file));
fs.writeFileSync(path.join(dir,'ADOPTION_INVENTORY.json'),JSON.stringify({at:new Date().toISOString(),method:'TypeScript JSX AST plus direct state-hook call references; wrappers/leaf controls remain explicit, not counted as separate certified forms',rows},null,2));
const lines=['# Full source-to-module workspace adoption register','','Generated from JSX and direct state-hook references. A row is a source surface, not necessarily one independent form. No source is certified solely by this inventory.','',
'## Required module tasks','',
'Each task below is OPEN for the owning module phase. For every linked row: define the canonical baseline and typed codec; preserve clear/false/zero/arrays; retain safe failed input; map server/custom validation to field and section; enforce operation identity and stale-write rejection for mutations; test create/edit/child/Cancel/Back/reload/account-switch with synthetic data. Preserve F03 scope checks. Replace conservative legacy dirty flags with baseline comparison. Do not rebuild the shared workspace.','',
'File bytes, passwords and authentication material are deliberately not restored. Child dialogs are blocking tasks with explicit Save/Cancel and departure warnings; forced departure discards their unsaved state. Typed remount support beyond that policy belongs to the module task. Native warnings can be overridden/suppressed by browsers and cannot guarantee crash recovery.',''];
for(const owner of [...new Set(rows.filter(r=>!r.pilot).map(r=>r.owner))].sort())lines.push(`### ${owner}-WS-ADOPTION`,'',`Required before closing ${owner}: accept every ${owner} row below under the test contract above. Any shared-framework defect returns to F04; module business logic is not a shared defect waiver.`,'');
lines.push('## Source register','','| Source | Surface / current adapter | Accountable task |','|---|---|---|');
for(const row of rows)lines.push(`| ${row.file} | ${row.tags.join(', ')||'State consumer'}; ${row.draft} | ${row.task} |`);
fs.writeFileSync(path.join(dir,'ADOPTION_TASKS.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({sources:rows.length,pilots:rows.filter(r=>r.pilot).length,moduleTasks:[...new Set(rows.filter(r=>!r.pilot).map(r=>r.task))]}));
