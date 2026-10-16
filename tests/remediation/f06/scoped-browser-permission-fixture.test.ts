// SOURCE ONLY: do not import or execute the main-only fixture helper.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {expect,it} from 'vitest';
const file='tests/remediation/f06/scoped-browser-permission-fixture.mjs';
const source=fs.readFileSync(file,'utf8');
// Offline canonical text only; the executable retains its exact raw seed hashes.
const canonicalLfHash=(value:string|Buffer)=>createHash('sha256').update(value.toString().replaceAll('\r\n','\n')).digest('hex');
const canonicalSeedHashes:Record<string,string>={
 'supabase/migrations/20260614191500_erp_settings_1_ai_settings_provider_configuration.sql':'4307c64a86c5bd292356737c8d615678524ad5650aabe5de4b3b5c456db698c1',
 'supabase/migrations/20260614230415_erp_settings_2_email_provider_microsoft_graph.sql':'2ca7aca217983bc7911da20cebe846fc86148e3c8e64fabd1aa70de80e72fa30',
};
const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const definitions:Record<string,string|boolean>[]=[];
for(const statement of parsed.statements){
  if(!ts.isVariableStatement(statement))continue;
  for(const declaration of statement.declarationList.declarations){
    if(declaration.name.getText(parsed)!=='permissionFixtures')continue;
    const outer=declaration.initializer;expect(outer&&ts.isCallExpression(outer)).toBe(true);
    if(!outer||!ts.isCallExpression(outer))throw Error('Missing frozen array');
    const array=outer.arguments[0];if(!ts.isArrayLiteralExpression(array))throw Error('Not literal data');
    for(const element of array.elements){
      if(!ts.isCallExpression(element)||!ts.isObjectLiteralExpression(element.arguments[0]))throw Error('Not frozen literal');
      const row:Record<string,string|boolean>={};
      for(const property of element.arguments[0].properties){
        if(!ts.isPropertyAssignment(property))throw Error('Not a literal field');
        const value=property.initializer;
        if(ts.isStringLiteral(value))row[property.name.getText(parsed)]=value.text;
        else if(value.kind===ts.SyntaxKind.TrueKeyword)row[property.name.getText(parsed)]=true;
        else throw Error('Unexpected literal type');
      }
      definitions.push(row);
    }
  }
}
const sources=[
  ['supabase/migrations/20260614191500_erp_settings_1_ai_settings_provider_configuration.sql','settings.ai.view','64896740174cd6e6081ab245a8f61afc5ae3a0e70679d1f7882590e3c20965e5'],
  ['supabase/migrations/20260614230415_erp_settings_2_email_provider_microsoft_graph.sql','settings.email.view','ec2bdc528aa61367f3810d09d23164458c9e0974421d2108fc37777ca945bfb7'],
];
it.each(Object.entries(canonicalSeedHashes))('canonical seed %s accepts LF/CRLF only and rejects content or whitespace changes',(path,hash)=>{
 const lf=fs.readFileSync(path,'utf8').replaceAll('\r\n','\n');
 expect(canonicalLfHash(lf)).toBe(hash);
 expect(canonicalLfHash(Buffer.from(lf.replaceAll('\n','\r\n')))).toBe(hash);
 for(const altered of [lf+'\nupdate public.permissions set is_active=false;\n',lf+' ',lf+'\r'])expect(canonicalLfHash(altered)).not.toBe(hash);
});
it('contains exactly the two absent canonical definitions, not a permission framework',()=>{
  expect(definitions.map(p=>p.permission_code)).toEqual(['settings.ai.view','settings.email.view']);
  expect(definitions).toHaveLength(2);expect(source).toContain("['provision','retire','check']");
});
it.each(sources)('binds exact fields and canonical text hash to seed %s',(path,code,hash)=>{
  const bytes=fs.readFileSync(path),text=bytes.toString('utf8');expect(canonicalLfHash(bytes)).toBe(canonicalSeedHashes[path]);
  expect(source).toContain(hash);
  const insert=text.match(/INSERT INTO (?:public\.)?permissions \(([^)]+)\)\s*VALUES([\s\S]*?)ON CONFLICT/);
  expect(insert).not.toBeNull();if(!insert)throw Error('No canonical seed');
  const columns=insert[1].split(',').map(c=>c.trim());
  const tuple=insert[2].split('\n').find(line=>line.includes("('"+code+"'"));expect(tuple).toBeDefined();
  const values=[...tuple!.matchAll(/'([^']*)'|\b(true|false)\b/g)].map(m=>m[2]?m[2]==='true':m[1]);
  expect(definitions.find(p=>p.permission_code===code)).toEqual(Object.fromEntries(columns.map((c,index)=>[c,values[index]])));
});
it('keeps the executable raw seed pins and source bytes unchanged',()=>{
 expect(Object.keys(canonicalSeedHashes)).toEqual(sources.map(([path])=>path));
 expect(createHash('sha256').update(source).digest('hex')).toBe('b1fb80cd35a16ddeafb014018e38b7e1d54329829f6d49c2121dabe08ac8e532');
});
it('does not invent permission marker columns or override canonical display fields',()=>{
  const database=fs.readFileSync('src/types/database.ts','utf8');
  const row=database.split('      permissions: {')[1].split('        Row: {')[1].split('        Insert: {')[0];
  expect(row).not.toContain('          notes:');
  for(const field of Object.keys(definitions[0]))expect(row).toContain('          '+field+':');
  expect(source).toContain('Ownership marker lives in the private');
  expect(source).not.toContain('permission_name=');expect(source).not.toContain('set description=');
});
it('provision refuses both pre-existing definitions and pre-started restricted actors',()=>{
  expect(source).toContain('BOTH_CANONICAL_CODES_MUST_BE_ABSENT');expect(source).toContain('CANONICAL_CODE_EXISTS');
  expect(source).toContain('ACTOR_PREP_ALREADY_STARTED');expect(source).not.toMatch(/ON CONFLICT/i);
  expect(source).toContain("const company=closedActor('company-branding')");
  expect(source.indexOf("const company=closedActor('company-branding')")).toBeLessThan(source.indexOf("fs.mkdirSync(directory"));
});
it('pins existing actor closure source without modifying/importing runtime helpers',()=>{
  expect(source).toContain('92010c4605855370b8dc1aad3fafbf65ca9c2b9f85584316a93cde126e48f5f6');
  expect(source).toContain('FROZEN_ACTOR_SOURCES_CHANGED');
  expect(source).not.toMatch(/^import .*scoped-browser-(?:runtime|acceptance-actor|resource-check)/m);
  expect(source).not.toContain("import('@supabase");expect(source).not.toContain('createClient');
});
it('requires both reader and branch exact closed actors and four owned links before retirement',()=>{
  expect(source).toContain("[closedActor('branch-restricted'),closedActor('global-reader')]");
  expect(source).toContain('assert.equal(expectedLinks.length,4)');expect(source).toContain('UNEXPECTED_PERMISSION_LINK');
  expect(source).toContain('SCOPED_ACTOR_NOT_CLOSED');expect(source).toContain("p.status='inactive'");
  expect(source).toContain('u.banned_until>now()');expect(source).toContain('from auth.sessions');expect(source).toContain('from auth.refresh_tokens');
  expect(source).toContain('assert.deepEqual(current.pairs,role.state.pairs)');
});
it('only inserts exact absent permission rows and later inactivates those exact IDs',()=>{
  const writes=[...source.matchAll(/(?:insert into|update|delete from) public\.([a-z_]+)/gi)].map(m=>m[1]);
  expect(writes).toEqual(['permissions','permissions']);
  expect(source).toContain('update public.permissions set is_active=false where id in (${ownedIds.join');
  expect(source).toContain('and permission_code in (${codes}) returning *');
  expect(source).not.toMatch(/delete\s+from|truncate\s|cascade\s/i);
  expect(source).toContain('PERMISSION_OWNERSHIP_CHANGED');expect(source).toContain('OWNED_PERMISSION_PREIMAGE_CHANGED');
});
it('records exact row/link preimages before mutation and preserves unrelated definitions',()=>{
  expect(source.indexOf("append('provision-intent'")).toBeLessThan(source.indexOf('insert into public.permissions'));
  expect(source.indexOf("append('retire-intent'")).toBeLessThan(source.indexOf('update public.permissions'));
  expect(source).toContain('EXISTING_PERMISSION_DEFINITION_CHANGED');expect(source).toContain('assert.deepEqual(snapshot(ownedIds),before)');
  expect(source).toContain('assert.deepEqual(query(linkSql),links)');expect(source).toContain('assert.deepEqual(stable(rows[i]),stable(provision.rows[i]))');
  expect(source).toContain("!['is_active','updated_at'].includes(k)");
});
it('refuses active browser windows and uses exact bounded loopback-only target',()=>{
  for(const text of ['c:/dev/agt-erp-f06','68ba17ecef10f3f77ae563b68d68bd146331bf844eeb735a3dae0d7831fd1d0c','16622',"HostIp:'127.0.0.1'",'SCOPED_ACTOR_WINDOW_OPEN','BROWSER_ACTOR_ACTIVE','REVIEWED_PERMISSION_SOURCE_REQUIRED','protected-local-parent','project-ref',"lock_timeout='5s'","transaction_timeout='30s'"])
    expect(source).toContain(text);
});
it('only reads scoped metadata receipts, never credentials or original fixture ledger',()=>{
  expect(source).not.toContain('keys-private.json');expect(source).not.toContain('fixtures-private.json');expect(source).not.toContain('credentials-private.json');
  expect(source).toContain("['role-prepare-private.json','prepare-private.json','role-retire-private.json','check-private.json']");
  expect(source).toContain("check.state,'PASS_EXACT_SCOPED_RESOURCES_ONLY'");expect(source).toContain('check.repairs,0');
});
it('retains failures, exact command locks and immutable attempt receipts without retries',()=>{
  expect(source).toContain("fs.openSync(localFile(name),'wx',0o600)");expect(source).toContain('previousEventHash');
  expect(source).toContain("command+'-attempt.json'");expect(source).toContain('FAILED_OUTCOME_REQUIRES_MAIN_RECONCILIATION');
  expect(source).toContain("append('failure-retained'");expect(source).toContain('noAutomaticRetry:true');
  expect(source).not.toContain('setTimeout');expect(source).not.toContain('retry(');
  expect(source).toContain("fs.openSync(lifetimeLock,'wx',0o600)");expect(source).toContain('assert.deepEqual(readJson(lifetimeLock),lifetime)');
});
it('final check is database read-only and never upgrades fixture completion to shipping/browser acceptance',()=>{
  expect(source).toContain("assert.ok(command!=='check'||!write,'CHECK_IS_READ_ONLY')");
  expect(source).toContain('PASS_TWO_PERMISSION_FIXTURES_RETIRED_ONLY');expect(source).toContain('shippingSchemaChange:false');
  expect(source).toContain('browserPassClaim:false');expect(source).toContain('repairs:0');
});
it('parses executable without importing it; runtime work is inside the guarded function',()=>{
  expect((parsed as unknown as {parseDiagnostics:unknown[]}).parseDiagnostics).toEqual([]);
  expect(source.indexOf('fs.readFileSync')).toBeGreaterThan(source.indexOf('export async function runPermissionFixture'));
  expect(source).toContain('pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url');
});
