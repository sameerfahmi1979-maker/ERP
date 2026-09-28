'use strict';
// Read-only inventory for the bounded section-state migration.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const rows=[];
function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())walk(p);else if(p.endsWith('form.tsx')){const s=fs.readFileSync(p,'utf8');if(!s.includes('useWorkspaceFormNavigation')||!s.includes('[activeSection, setActiveSection] = useState('))continue;const source=ts.createSourceFile(p,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let sections;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='sections')sections=n.initializer?.getText(source);ts.forEachChild(n,visit);}visit(source);
if(!sections)throw Error('No sections '+p);rows.push({file:p.replaceAll('\\','/'),line:s.match(/  const \[activeSection, setActiveSection\] = useState\((.*)\);/)[0],initial:s.match(/  const \[activeSection, setActiveSection\] = useState\((.*)\);/)[1],sections,ids:[...sections.matchAll(/id:\s*"([^"]+)"/g)].map(m=>m[1])});}}}
if(process.argv[2]==='nullable'){
 const values=[];
 function nullable(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())nullable(p);else if(p.endsWith('workspace-form.tsx')){const s=fs.readFileSync(p,'utf8');const matches=[...s.matchAll(/const d = getDraftDefault\("([^"]+)", ""\);\s*return d \? Number\(d\) : ([^;]+);/g)].map(m=>({old:m[0],field:m[1],fallback:m[2]}));if(matches.length)values.push({file:p.replaceAll('\\','/'),matches});}}}
 nullable('src/features');console.log(JSON.stringify(values));
}else{walk('src/features');console.log(JSON.stringify(rows));}
