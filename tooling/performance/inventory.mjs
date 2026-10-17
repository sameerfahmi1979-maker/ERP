// Static read-consumer crosswalk. Discovery is never runtime acceptance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {overlaySourcesAreCurrent} from './overlay-source-check.cjs';
import {preservedAcceptanceQualification, qualificationMarkdown} from './acceptance-qualification.cjs';
import {inspectInventoryOutput, writeInventoryOutput} from './inventory-output.cjs';
import {hasRuntimeImport, hasRuntimeExport, classifySource} from './inventory-semantics.cjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv[2];
if (!out || !path.isAbsolute(out) || !/^C:[\\/]/i.test(out)) throw Error('Absolute C: evidence directory required');
const outputRegisterPath = inspectInventoryOutput(out)['ADOPTION_REGISTER.json'];
// Optional read-only prior evidence directory lets a new snapshot preserve holds
// without replacing the historical register or its manually maintained Markdown.
const priorDirectory = process.argv[5];
if (priorDirectory && (!path.isAbsolute(priorDirectory) || !/^C:[\\/]/i.test(priorDirectory))) throw Error('Absolute C: prior evidence directory required');
const previousRegisterPath = priorDirectory ? inspectInventoryOutput(priorDirectory)['ADOPTION_REGISTER.json'] : outputRegisterPath;
if (priorDirectory && !fs.existsSync(previousRegisterPath)) throw Error('Explicit prior register is missing; refusing to lose acceptance qualifications');
const previousRegister = fs.existsSync(previousRegisterPath) ? JSON.parse(fs.readFileSync(previousRegisterPath, 'utf8')) : null;
const currentAcceptanceQualification = preservedAcceptanceQualification(previousRegister);
const historicFile = process.argv[3], overridesFile = process.argv[4];
if (!historicFile || !path.isAbsolute(historicFile)) throw Error('Historical inventory path required');
const historic = JSON.parse(fs.readFileSync(historicFile, 'utf8'));
const overrides = overridesFile ? JSON.parse(fs.readFileSync(overridesFile, 'utf8')).byFile ?? {} : {};
const configFile = ts.readConfigFile(path.join(root, 'tsconfig.shipping.json'), ts.sys.readFile);
if (configFile.error) throw Error('Cannot read source compiler configuration');
const compilerOptions = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root).options;
const resolutionCache = ts.createModuleResolutionCache(root, file => file.toLowerCase(), compilerOptions);
function resolveRuntimeImport(specifier, file) {
  const resolved = ts.resolveModuleName(specifier, file, compilerOptions, ts.sys, resolutionCache).resolvedModule?.resolvedFileName;
  if (!resolved) return null;
  const relative = path.relative(root, resolved).replaceAll('\\', '/');
  return relative.startsWith('src/') ? relative : null;
}
const ids = new Map(historic.sources.map(s => [s.file, s]));
const routes = new Map(historic.routes.map(r => [r.file, r]));
const files = [];
function walk(dir) { for (const e of fs.readdirSync(dir, {withFileTypes:true})) { const f = path.join(dir,e.name); if(e.isDirectory()) walk(f); else if(/\.[cm]?[jt]sx?$/.test(f)) files.push(f); } }
walk(path.join(root,'src'));
const digest = s => crypto.createHash('sha256').update(s).digest('hex');
const reviewedActions = {};
const mutationModule = 'src/server/actions/dms/review-queue.ts';
const mutationSource = path.join(root, mutationModule);
if (fs.existsSync(mutationSource) && digest(fs.readFileSync(mutationSource)) === '16f2584f9fb5cc13e30454edca8cb347b00052b30f195c3051cb66da4441e962') {
  reviewedActions[mutationModule+'#resolveDmsReviewQueueItem'] = 'MUTATION';
}
const rows = [], manifest = [];
for (const file of files.sort()) {
  const rel = path.relative(root,file).replaceAll('\\','/'), text = fs.readFileSync(file,'utf8');
  const old = ids.get(rel), originalRoute = routes.get(rel);
  const route = originalRoute ?? (/^src\/app\/.+\/page\.[jt]sx$/.test(rel) ? {id:'PAGE-'+digest(rel).slice(0,12).toUpperCase(),route:'/'+rel.replace(/^src\/app\//,'').replace(/\/page\.[jt]sx$/,'').split('/').filter(part=>!/^\(|^@/.test(part)).join('/')} : null);
  const ast = ts.createSourceFile(rel,text,ts.ScriptTarget.Latest,true);
  const imports = [], calls = [], readSignals = [], surfaces = [], dependencies = new Set();
  const client = /^\s*["']use client["']/.test(text), serverAction = /^\s*["']use server["']/.test(text);
  function visit(n) {
    if(ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const spec = n.moduleSpecifier.text;
      const names = n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings) ? n.importClause.namedBindings.elements.map(e=>({local:e.name.text, imported:e.propertyName?.text ?? e.name.text})) : [];
      imports.push({from:spec,names});
      if (hasRuntimeImport(ts,n)) {
        const resolved = resolveRuntimeImport(spec,file);
        if (resolved) dependencies.add(resolved);
      }
    }
    if (ts.isExportDeclaration(n) && hasRuntimeExport(ts,n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const resolved = resolveRuntimeImport(n.moduleSpecifier.text,file);
      if (resolved) dependencies.add(resolved);
    }
    if(ts.isCallExpression(n)) {
      const expr = n.expression.getText(ast), line=ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1;
      calls.push({expression:expr,line});
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
        const resolved = resolveRuntimeImport(n.arguments[0].text,file);
        if (resolved) dependencies.add(resolved);
      }
      if(/(?:useQuery|useInfiniteQuery|useEffect|useRealtimeSync|useInterval|setInterval|\.from|\.rpc|\.select|\.range|fetch|\.refresh)$/.test(expr)) readSignals.push({expression:expr,line});
    }
    if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)) {
      const tag=n.tagName.getText(ast);
      if(/(?:Table|List|Combobox|Select|Dialog|Form|Section|Dashboard|Boundary|Error|Loading)/.test(tag)) surfaces.push({tag,line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1});
    }
    ts.forEachChild(n,visit);
  }
  visit(ast);
  const semanticDiscovery=classifySource(ts,ast,rel,specifier=>resolveRuntimeImport(specifier,file),reviewedActions);
  const actionImports=imports.filter(i=>i.from.startsWith('@/server/actions/')).flatMap(i=>i.names.map(n=>({...n,from:i.from})));
  const invoked=actionImports.filter(i=>calls.some(c=>c.expression===i.local));
  const likelyReads=invoked.filter(i=>/^(get|list|load|fetch|search|resolve|check|count|find|preview)/i.test(i.imported));
  const patterns=[];
  if(client && likelyReads.length) patterns.push('client-action-read-candidate');
  if(!client && likelyReads.length) patterns.push('server-initial-read-candidate');
  if(readSignals.some(s=>s.expression==='useQuery'||s.expression==='useInfiniteQuery')) patterns.push('tanstack-query');
  if(readSignals.some(s=>/\.from$|\.rpc$/.test(s.expression))) patterns.push('direct-data-client');
  if(readSignals.some(s=>/fetch$/.test(s.expression))) patterns.push('fetch-adapter');
  if(readSignals.some(s=>/setInterval$|useRealtimeSync$|\.refresh$/.test(s.expression))) patterns.push('background-or-refresh');
  if(imports.some(i=>i.from.startsWith('@/hooks/lookups/')&&i.names.some(n=>calls.some(c=>c.expression===n.local)))) patterns.push('shared-lookup-hook');
  if(/useSortPaginate/.test(text)) patterns.push('client-pagination-review');
  if(surfaces.some(s=>/Combobox|Select/.test(s.tag))) patterns.push('lookup-consumer');
  const isUi=/\.tsx$/.test(rel), applicable=patterns.length>0||likelyReads.length>0||Boolean(route);
  const id=old?.id??(isUi?'SRC-':'CODE-')+digest(rel).slice(0,12).toUpperCase();
  manifest.push({file:rel,sha256:digest(text)});
  rows.push({id,file:rel,sourceSha256:digest(text),pageId:route?.id??null,route:route?.route??null,pageRefs:old?.pageRefs??[],module:old?.module??route?.module??null,client,serverAction,applicable,patterns,runtimeDependencies:[...dependencies].sort(),directCallers:[],readCandidates:likelyReads,readSignals,surfaces,historicSurfaces:historic.surfaces.filter(s=>s.file===rel).map(s=>s.id),classification:'STATIC_CANDIDATE_REQUIRES_SEMANTIC_REVIEW',status:applicable?'INVENTORIED_UNTESTED':'SUPPORT_OR_NON_READ_REVIEW',implementation:null,tests:{positive:'NOT_RUN',denied:'NOT_RUN',failure:'NOT_RUN',browser:'NOT_RUN'},baseline:null,candidate:null,gaps:[]});
  Object.assign(rows.at(-1), {semanticDiscovery, historicPageRefs:[...(old?.pageRefs??[])], currentPageRefs:[]});
}
const byPath = new Map(rows.map(row=>[row.file,row]));
for (const row of rows) for (const dependency of row.runtimeDependencies) {
  const target = byPath.get(dependency); if (target) target.directCallers.push(row.id);
}
const graph = [];
for (const page of rows.filter(row=>row.pageId)) {
  const seen = new Set(), pending = [page.file];
  // A page need not import the layout that mounts its background readers.
  for(let directory=path.dirname(page.file);directory.startsWith('src/app');directory=path.dirname(directory)) {
    for(const extension of ['tsx','ts','jsx','js']) { const layout=directory+'/layout.'+extension; if(byPath.has(layout))pending.push(layout); }
    if(directory==='src/app')break;
  }
  while(pending.length) { const current=pending.pop(); if(seen.has(current))continue;seen.add(current);const row=byPath.get(current);if(row)pending.push(...row.runtimeDependencies); }
  for(const file of seen) {const row=byPath.get(file);if(row){row.currentPageRefs.push(page.pageId);if(!row.pageRefs.includes(page.pageId))row.pageRefs.push(page.pageId);}}
  graph.push({pageId:page.pageId,route:page.route,source:page.file,potentialRuntimeConsumers:[...seen].filter(file=>byPath.get(file)?.applicable).sort(),status:'IMPORT_GRAPH_DISCOVERY_NOT_CALLSITE_OR_RUNTIME_ACCEPTANCE'});
}
for(const row of rows) {
  row.currentPageRefs.sort();
  row.semanticDiscovery.pageReachability = row.currentPageRefs.length ? 'POTENTIAL_CURRENT_PAGE_DEPENDENCY' : 'NO_CURRENT_PAGE_IMPORT_PATH_NOT_PROOF_OF_DEAD_CODE';
  row.pageRefs.sort();row.directCallers.sort();const overlay=overrides[row.file];if(!overlay)continue;
  for(const field of ['classification','implementation','tests','baseline','candidate','gaps','owner','findingIds','expectedScope','measuredResult','acceptanceDependencies'])if(overlay[field]!==undefined)row[field]=overlay[field];
  const changed=!overlaySourcesAreCurrent(root,overlay,row.sourceSha256);
  row.status=changed?'SOURCE_CHANGED_REVERIFICATION_REQUIRED':overlay.status;
  if(changed)row.gaps.push('Manual acceptance receipt belongs to different source/dependency hashes; rerun affected checks.');
}
const discoveredPaths = new Set(rows.map(r=>r.file));
const priorSources = new Map([...historic.sources,...(previousRegister?.rows??[])].map(row=>[row.file,row]));
const removed = [...priorSources.values()].filter(s=>!discoveredPaths.has(s.file)).map(s=>({id:s.id,file:s.file,status:'ABSENT_FROM_CURRENT_SOURCE_RECONCILIATION_REQUIRED'}));
const result={at:new Date().toISOString(),method:'TypeScript AST and resolved runtime import/re-export/literal dynamic-import graph plus ancestor layouts; conservative potential reachability, not execution. Hash-bound manual overlays survive inventory refresh. No automatic per-caller pass.',counts:{sourceFiles:rows.length,uiFiles:rows.filter(r=>/\.tsx$/.test(r.file)).length,historicPages:historic.routes.length,currentPages:rows.filter(r=>r.pageId).length,applicableCandidates:rows.filter(r=>r.applicable).length,clientActionReadCandidates:rows.filter(r=>r.patterns.includes('client-action-read-candidate')).length,manualOverlays:rows.filter(r=>overrides[r.file]).length},rows,removed};
if (currentAcceptanceQualification !== undefined) result.currentAcceptanceQualification = currentAcceptanceQualification;
result.semanticSummary = {
  qualification:'ADDITIVE_STATIC_CLASSIFICATION_NOT_RUNTIME_OR_ACCEPTANCE',
  roles:Object.fromEntries([...new Set(rows.map(row=>row.semanticDiscovery.role))].sort().map(role=>[role,rows.filter(row=>row.semanticDiscovery.role===role).length])),
  verifiedActionDecisions:reviewedActions,
  limitations:['Raw patterns/readCandidates remain conservative discovery, not proven reads.','Unknown RPCs and action references require callee review.','No current page import path does not establish dead code: framework entrypoints, external callers and dynamic loading may apply.','Import references may include shadowed local names; they are candidates, not executed call counts.'],
};
result.priorRegisterSha256=fs.existsSync(previousRegisterPath)?digest(fs.readFileSync(previousRegisterPath)):null;
const outputContents = {
  'ADOPTION_REGISTER.json': JSON.stringify(result,null,2),
  'READ_DEPENDENCY_GRAPH.json': JSON.stringify({at:result.at,method:result.method,pages:graph},null,2),
  'SOURCE_MANIFEST.json': JSON.stringify({at:result.at,files:manifest,manifestSha256:digest(JSON.stringify(manifest))},null,2),
  'ADOPTION.md': '# Performance adoption overlay\n\nStatic discovery is not acceptance. Explicit hash-bound overlays distinguish implemented service/component contracts from still-open browser/per-consumer acceptance. Potential import reachability does not automatically pass forms that use a shared provider. Existing PAGE/SRC IDs are retained. Previous snapshots are retained in history/.\n\n'+qualificationMarkdown(currentAcceptanceQualification)+JSON.stringify(result.counts)+'\n\n| ID | Source | Patterns | Status |\n| --- | --- | --- | --- |\n'+rows.filter(r=>r.applicable).map(r=>`| ${r.id} | ${r.file} | ${r.patterns.join(', ')||'route composition'} | ${r.status} |`).join('\n')+'\n',
};
writeInventoryOutput(out, result.at.replace(/[^0-9]/g,''), outputContents);
console.log(JSON.stringify({counts:result.counts,removed:removed.length,out}));
