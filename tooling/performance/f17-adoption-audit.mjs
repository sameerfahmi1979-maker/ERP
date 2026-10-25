import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

// Static coverage inventory, never a claim of runtime or owner acceptance.
const root=process.cwd();
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(/\.(ts|tsx)$/.test(file))files.push(file);}}
walk(path.join(root,'src'));
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const route=file=>'/'+relative(file).replace(/^src\/app\//,'').replace(/(?:^|\/)(page|route)\.tsx?$/,'').split('/').filter(p=>!p.startsWith('(')&&!p.startsWith('@')).join('/');
const routes=files.filter(f=>/[\\/](page|route)\.tsx?$/.test(f)).map(file=>({path:route(file),file:relative(file),kind:/[\\/]page\.tsx?$/.test(file)?'page':'endpoint'}));
const matches=url=>routes.some(r=>r.path===url || (r.path.split('/').length===url.split('/').length&&r.path.split('/').every((v,i)=>/^\[.*\]$/.test(v)||v===url.split('/')[i])));
const links=[],surfaces=[];
for(const file of files){
 const text=fs.readFileSync(file,'utf8'),rel=relative(file);
 const ast=ts.createSourceFile(rel,text,ts.ScriptTarget.Latest,true,rel.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const kinds=[];
 if(routes.some(r=>r.file===rel))kinds.push('route');
 if(/^['"]use server['"];?/m.test(text))kinds.push('action');
 if(/useForm\b|<form\b|useWorkspace.*Draft|FormErrorSummary/.test(text))kinds.push('form');
 if(/ERPDataTable|useReactTable|<table\b/.test(text))kinds.push('list');
 if(kinds.length)surfaces.push({id:`SOURCE:${rel}`,path:rel,kinds,sha256:crypto.createHash('sha256').update(text).digest('hex'),module:rel.includes('/hr/')?'HR':rel.includes('/dms/')?'DMS':rel.includes('/ai/')?'AI':rel.includes('/reports/')?'Reports':'Shared',
  contracts:{sharedTable:/ERPDataTable/.test(text),embedded:/presentation=["']embedded/.test(text),validation:/FormErrorSummary|FieldError|formState|safeParse|\.parse\(|validation|schema/i.test(text),scopedRead:/getAuthContext|hasPermission|PermissionGate|useAuth|scopedContext|readJson|useQuery/.test(text)},acceptance:'source inventory; tests separately mapped; owner manual deferred'});
 function visit(node){
  let value=null,disabled=false;
  if(ts.isPropertyAssignment(node)&&['path','href'].includes(node.name.getText(ast).replace(/["']/g,''))&&ts.isStringLiteral(node.initializer)&&(/app-sidebar|dashboard-links|route-access-registry/.test(rel))){value=node.initializer.text;disabled=ts.isObjectLiteralExpression(node.parent)&&node.parent.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast)==='disabled'&&p.initializer.kind===ts.SyntaxKind.TrueKeyword);}
  if(ts.isJsxAttribute(node)&&node.name.getText(ast)==='href'&&node.initializer&&ts.isStringLiteral(node.initializer))value=node.initializer.text;
  if(ts.isCallExpression(node)&&/\.(push|replace)$/.test(node.expression.getText(ast))&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))value=node.arguments[0].text;
  if(value?.startsWith('/')&&!value.startsWith('//')){const url=value.split(/[?#]/)[0];links.push({file:rel,line:ast.getLineAndCharacterOfPosition(node.getStart()).line+1,url,disabled,status:disabled?'explicit future placeholder':matches(url)?'source route exists':fs.existsSync(path.join(root,'public',url.slice(1)))?'public asset':'review required'});}
  ts.forEachChild(node,visit);
 } visit(ast);
}
const historicalFile=process.argv[2],historical=historicalFile?JSON.parse(fs.readFileSync(historicalFile,'utf8')).surfaces??[]:[];
const history=historical.map(s=>({id:s.id,path:s.path??null,state:typeof s.path!=='string'?'non-file surface; original phase authority retained':fs.existsSync(path.join(root,s.path))?'present; inspect current source hash':'retired or moved; prior evidence retained'}));
const report={generatedAt:new Date().toISOString(),qualification:'Static source inventory only. Does not infer all contract regex matches are runtime acceptance. Manual browser/device checks deferred by owner.',routes,surfaces,links,history};
const out=process.argv[3];if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({routes:routes.length,surfaces:surfaces.length,historical:history.length,links:links.length,review:links.filter(l=>l.status==='review required')},null,2));
