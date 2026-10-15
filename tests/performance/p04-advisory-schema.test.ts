import {expect,it} from "vitest";
import ts from "typescript";
import {readFileSync} from "node:fs";
const generated=readFileSync("src/types/database.ts","utf8").replace(/\r\n/g,"\n");
function fields(table:string){const start=generated.indexOf(`      ${table}: {\n        Row: {`);expect(start,table).toBeGreaterThan(0);const body=generated.slice(start,generated.indexOf("        Insert:",start));return new Set([...body.matchAll(/^          ([a-z_]+):/gm)].map(m=>m[1]));}
for(const file of ["src/lib/ai/common/dashboard/dashboard-collectors.ts","src/lib/ai/common/audit-explainer/audit-collectors.ts"]){
 it(file+" uses generated native column names rather than stale prototype fields",()=>{
  const source=ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true);let checked=0;
  function from(node:ts.Node):string|null{if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){if(node.expression.name.text==="from"&&ts.isStringLiteral(node.arguments[0]))return node.arguments[0].text;return from(node.expression.expression);}return null;}
  function visit(node:ts.Node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&["select","order","eq","is","lt","gte","in","not"].includes(node.expression.name.text)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])){
   const table=from(node.expression.expression);if(table){const native=fields(table),input=node.arguments[0].text;
    for(const column of node.expression.name.text==="select"?input.split(",").map(c=>c.trim().split(":").at(-1)!):[input]){expect(native.has(column),`${table}.${column}`).toBe(true);checked++;}
   }
  }ts.forEachChild(node,visit);}
  visit(source);expect(checked).toBeGreaterThan(30);
 });
}
