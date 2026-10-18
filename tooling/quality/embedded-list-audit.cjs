/* Source-only inventory and adoption guard. Never starts an app, browser or database. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');

const embeddedTables = new Set([
  'features/users/user-workspace-form.tsx',
  'features/users/user-security-history-section.tsx',
  'features/users/user-effective-access-section.tsx',
  'features/roles/role-permissions-section.tsx',
  'features/roles/role-assigned-users-section.tsx',
  'features/permissions/permission-command-center.tsx',
  'features/organizations/company-signatories-section.tsx',
  'features/common-master-data/work-calendars/work-calendar-workspace-form.tsx',
  'features/common-master-data/master-archive-panel.tsx',
  'features/hr/employees/employee-letters-forms.tsx',
  // F09 attempt/review history lives inside the queue-row dialog, not a main list.
  'features/notifications/admin/email-attempt-history.tsx',
  'features/dms/admin/dms-ai-metadata-suggestions-dialog.tsx',
  'features/dms/admin/dms-metadata-erp-mappings-dialog.tsx',
  'features/dms/apply-to-erp/dms-apply-to-erp-item-table.tsx',
]);
const embeddedLoaded = new Set([
  'features/dms/documents/sections/dms-document-files-section.tsx',
  'features/dms/documents/sections/dms-document-links-section.tsx',
  'features/dms/expiry/dms-reminder-schedule-table.tsx',
  'features/dms/admin/dms-standard-file-name-bulk-rename-panel.tsx',
  'features/dms/upload/dms-upload-cleanup-panel.tsx',
]);
const masterRecordCollections = new Set([
  // Dedicated three-panel browser is a principal collection navigator, not a form.
  'features/hr/document-browser/hr-doc-browser-doc-list.tsx',
  'features/settings/ai/ai-provider-config-list.tsx',
  'features/settings/ai/ai-feature-flags-panel.tsx',
  'features/hr/settings/hr-settings-lookup-page.tsx',
  'features/hr/settings/hr-mohre-establishments-page.tsx',
  'features/ai/common/risk-scoring/risk-scores-page-client.tsx',
  'features/ai/common/duplicate-detection/duplicate-candidates-page-client.tsx',
  'features/ai/common/compliance-checker/compliance-findings-page-client.tsx',
]);

function filesUnder(directory) {
  return fs.readdirSync(directory, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.name === '__tests__' || entry.name === 'node_modules') return [];
    const full = path.join(directory,entry.name);
    return entry.isDirectory() ? filesUnder(full) : full.endsWith('.tsx') && !/\.test\.tsx$/.test(full) ? [full] : [];
  });
}
function disposition(file, tag) {
  if (file.startsWith('components/')) return 'infrastructure';
  if (tag === 'RecordCollection') return masterRecordCollections.has(file) ? 'worklist' : 'embedded';
  if (['LoadedListTools','DmsListTools','TablePagination'].includes(tag)) return embeddedLoaded.has(file) ? 'embedded' : 'worklist';
  if (embeddedTables.has(file) || /(?:-tab|-section|-form|-dialog)\.tsx$/.test(file) || file.includes('/tabs/') || file.startsWith('features/dms/documents/sections/') || file.startsWith('features/dms/ai-observability/sections/')) return 'embedded';
  return 'worklist';
}
const tags = new Set(['ERPDataTable','RecordCollection','LoadedListTools','DmsListTools','TablePagination','EditColumns','EditFilters']);
function audit(root = process.cwd()) {
  const entries = [], changes = [], compactTables = [];
  const files = filesUnder(path.join(root,'src'));
  for (const full of files) {
    const file = path.relative(path.join(root,'src'),full).replaceAll('\\','/');
    const source = fs.readFileSync(full,'utf8');
    const ast = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const edits = [];
    const counters = {};
    function visit(node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast)==='table') {
        compactTables.push({file:`src/${file}`,line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1});
      }
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && tags.has(node.tagName.getText(ast))) {
        const tag = node.tagName.getText(ast), index = counters[tag] = (counters[tag] ?? 0) + 1;
        const mode = disposition(file,tag);
        const attribute = node.attributes.properties.find(p=>ts.isJsxAttribute(p) && p.name.getText(ast)==='presentation');
        const actual = attribute?.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : null;
        const idProperty = node.attributes.properties.find(p=>ts.isJsxAttribute(p) && ['id','tableId'].includes(p.name.getText(ast)));
        const needsProp = mode !== 'infrastructure' && (['ERPDataTable','RecordCollection'].includes(tag) || tag === 'TablePagination' && mode === 'embedded');
        entries.push({id:'EMB-'+crypto.createHash('sha256').update(`${file}:${tag}:${index}`).digest('hex').slice(0,12).toUpperCase(),file:`src/${file}`,line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,tag,mode,actual,identity:idProperty?.initializer?.getText(ast)??`${tag} ${index}`,required:needsProp});
        if (needsProp && !attribute) edits.push({start:node.attributes.pos,end:node.attributes.pos,text:` presentation="${mode}"`});
        else if (needsProp && attribute?.initializer && actual !== mode) edits.push({start:attribute.initializer.getStart(ast),end:attribute.initializer.end,text:JSON.stringify(mode)});
      }
      if (embeddedLoaded.has(file) && ts.isCallExpression(node) && ['useLoadedListView','useDmsListView'].includes(node.expression.getText(ast))) {
        if (node.arguments.length === 3) edits.push({start:node.arguments.end,end:node.arguments.end,text:', {presentation:"embedded"}'});
        else if (node.arguments.length !== 4 || !/presentation\s*:\s*["']embedded["']/.test(node.arguments[3].getText(ast))) throw new Error(`Review options manually in ${file}`);
      }
      ts.forEachChild(node,visit);
    }
    visit(ast);
    let changed = source;
    for (const edit of edits.sort((a,b)=>b.start-a.start)) changed = changed.slice(0,edit.start)+edit.text+changed.slice(edit.end);
    if (embeddedLoaded.has(file)) {
      changed = changed.replace(/minWidth:\s*(listView|view)\.visible\.reduce\(\(sum,\s*(column|c)\)\s*=>\s*sum\s*\+\s*\2\.width,\s*0\)/g,'width: "100%", tableLayout: "auto"');
      changed = changed.replace(/width:\s*(column|c)\.width/g,'width: undefined');
    }
    if (changed !== source) changes.push({file:`src/${file}`,source,changed});
  }
  return {filesScanned:files.length,entries,compactTables,changes};
}
function patchFor(changes, root=process.cwd()) {
  let patch='*** Begin Patch\n';
  for (const {file,source,changed} of changes) {
    const oldLines=source.replaceAll('\r\n','\n').split('\n'), newLines=changed.replaceAll('\r\n','\n').split('\n');
    if (oldLines.length!==newLines.length) throw new Error(`Mechanical edit changed line count: ${file}`);
    const changedLines=oldLines.flatMap((line,i)=>line===newLines[i]?[]:[i]);
    if (!changedLines.length) continue;
    patch+=`*** Update File: ${path.join(root,file).replaceAll('\\','/')}\n`;
    let start=0;
    while (start<changedLines.length) {
      let end=start;
      while (end+1<changedLines.length && changedLines[end+1]-changedLines[end]<5) end++;
      const first=Math.max(0,changedLines[start]-2),last=Math.min(oldLines.length-1,changedLines[end]+2);
      patch+='@@\n';
      for(let i=first;i<=last;i++) patch+=oldLines[i]===newLines[i]?` ${oldLines[i]}\n`:`-${oldLines[i]}\n+${newLines[i]}\n`;
      start=end+1;
    }
  }
  return patch+'*** End Patch';
}
module.exports={audit,disposition,embeddedLoaded};
if(require.main===module) {
  const result=audit();
  if(process.argv.includes('--patch')) process.stdout.write(JSON.stringify({patch:patchFor(result.changes),changedFiles:result.changes.length}));
  else if(process.argv.includes('--check')) {
    const failures=result.entries.filter(e=>e.required&&e.mode!==e.actual);
    console.log(JSON.stringify({filesScanned:result.filesScanned,surfaces:result.entries.length,failures},null,2));
    if(failures.length) process.exitCode=1;
  } else console.log(JSON.stringify({filesScanned:result.filesScanned,entries:result.entries,compactTables:result.compactTables},null,2));
}
