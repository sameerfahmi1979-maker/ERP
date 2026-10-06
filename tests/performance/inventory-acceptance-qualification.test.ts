import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {afterEach,expect,it,vi} from 'vitest';

type Qualification={recordedAt:string;status:string;note:string;evidence?:string;historicalRowsPreserved?:boolean};
const helper=createRequire(import.meta.url)(path.resolve('tooling/performance/acceptance-qualification.cjs')) as {
  preservedAcceptanceQualification:(previous:unknown)=>Qualification|undefined;
  qualificationMarkdown:(qualification:Qualification|undefined)=>string;
};
const qualification:Qualification={recordedAt:'2026-10-04T18:55:00Z',status:'NATIVE_ACCEPTANCE_REOPENED',note:'Historical passes do not override the current hold.',evidence:'private-evidence.md',historicalRowsPreserved:true};
it('preserves all separately recorded qualification fields without mutating the old register',()=>{
  const result=helper.preservedAcceptanceQualification({currentAcceptanceQualification:qualification});
  expect(result).toEqual(qualification);expect(result).not.toBe(qualification);
});
it('does not invent acceptance status for a first-time inventory',()=>{
  expect(helper.preservedAcceptanceQualification(null)).toBeUndefined();expect(helper.preservedAcceptanceQualification({rows:[]})).toBeUndefined();
});
it.each([null,false,[],{}, {status:'PASS'}, {...qualification,recordedAt:'invalid'}, {...qualification,note:''}])('fails closed rather than silently erasing a malformed qualification %#',value=>{
  expect(()=>helper.preservedAcceptanceQualification({currentAcceptanceQualification:value})).toThrow();
});
it('the actual generator copies the qualification before writing either output',()=>{
  const source=fs.readFileSync('tooling/performance/inventory.mjs','utf8');
  expect(source).toContain('preservedAcceptanceQualification(previousRegister)');
  const statement=source.match(/if \(currentAcceptanceQualification !== undefined\) result\.currentAcceptanceQualification = currentAcceptanceQualification;/)?.[0];
  expect(statement).toBeDefined();
  const result:Record<string,unknown>={rows:[]};vm.runInNewContext(statement!,{result,currentAcceptanceQualification:qualification});
  expect(result.currentAcceptanceQualification).toEqual(qualification);
  const serialized = source.indexOf("'ADOPTION_REGISTER.json': JSON.stringify(result");
  const written = source.indexOf('writeInventoryOutput(out,');
  expect(serialized).toBeGreaterThan(-1);expect(written).toBeGreaterThan(-1);
  expect(source.indexOf(statement!)).toBeLessThan(serialized);expect(serialized).toBeLessThan(written);
  expect(source).toContain('qualificationMarkdown(currentAcceptanceQualification)');
});
it('renders the current warning in the Markdown inventory, not only the JSON',()=>{
  const markdown=helper.qualificationMarkdown(qualification);expect(markdown).toContain('Current acceptance qualification');expect(markdown).toContain(qualification.note);
  expect(helper.qualificationMarkdown(undefined)).toBe('');
});
it('keeps embedded Markdown/HTML in a note inert rather than creating new headings or links',()=>{
  const markdown=helper.qualificationMarkdown({...qualification,note:'line\n# pretend pass [x](url) <script>'});
  expect(markdown).toContain('line \\# pretend pass \\[x\\](url) \\<script\\>');
});
it('keeps the documented CommonJS entrypoint and propagates preflight failures',()=>{
  const result=spawnSync(process.execPath,['tooling/performance/inventory.cjs'],{encoding:'utf8',windowsHide:true,timeout:10000});
  expect(result.error).toBeUndefined();expect(result.status).toBe(1);
  expect(result.stderr.trim()).toBe('Absolute C: evidence directory required');
});

const output=createRequire(import.meta.url)(path.resolve('tooling/performance/inventory-output.cjs')) as {
  inventoryFiles:string[];
  inspectInventoryOutput:(out:string,snapshot?:string)=>Record<string,string>;
  writeInventoryOutput:(out:string,snapshot:string,contents:Record<string,string>)=>void;
};
const fixtureParent=path.resolve('.performance');
const fixtures:{root:string;ino:number;dev:number;links:{name:string;target:string;ino:number;dev:number}[]}[]=[];
const stamp='20261006070000000';
const payload=(value:string)=>Object.fromEntries(output.inventoryFiles.map(name=>[name,value+name]));
function fixture(){
  const parent=fs.lstatSync(fixtureParent);
  expect(parent.isDirectory()&&!parent.isSymbolicLink()).toBe(true);
  expect(path.relative(fixtureParent,fs.realpathSync(fixtureParent))).toBe('');
  const root=fs.mkdtempSync(path.join(fixtureParent,'inventory-containment-'));
  const stat=fs.lstatSync(root);const record={root,ino:stat.ino,dev:stat.dev,links:[] as {name:string;target:string;ino:number;dev:number}[]};
  fixtures.push(record);
  const sibling=path.join(root,'sibling');fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(sibling,'sentinel'),'unchanged');
  return {root,out:path.join(root,'output'),sibling,record};
}
function link(f:ReturnType<typeof fixture>,name:string,target:string,kind:'dir'|'file'){
  fs.symlinkSync(target,name,kind==='dir'&&process.platform==='win32'?'junction':kind);
  const stat=fs.lstatSync(name);f.record.links.push({name,target:fs.readlinkSync(name),ino:stat.ino,dev:stat.dev});
}
function seed(out:string){fs.mkdirSync(out,{recursive:true});for(const[name,value]of Object.entries(payload('old:')))fs.writeFileSync(path.join(out,name),value);}
function unchanged(out:string){for(const[name,value]of Object.entries(payload('old:')))expect(fs.readFileSync(path.join(out,name),'utf8')).toBe(value);}
afterEach(()=>{
  vi.restoreAllMocks();
  for(const f of fixtures.splice(0)){
    for(const entry of f.links.reverse()){
      const stat=fs.lstatSync(entry.name);
      if(!stat.isSymbolicLink()||stat.ino!==entry.ino||stat.dev!==entry.dev||fs.readlinkSync(entry.name)!==entry.target)throw Error('Fixture link identity changed: '+entry.name);
      fs.unlinkSync(entry.name);
    }
    const stat=fs.lstatSync(f.root);const relative=path.relative(fixtureParent,f.root);
    if(!relative.startsWith('inventory-containment-')||relative.includes(path.sep)||stat.isSymbolicLink()||stat.ino!==f.ino||stat.dev!==f.dev||path.relative(f.root,fs.realpathSync(f.root))!=='')throw Error('Unsafe fixture cleanup: '+f.root);
    fs.rmSync(f.root,{recursive:true});
  }
});
it('admits the previous register before any caller existence/read check and centralizes all writes',()=>{
  const source=fs.readFileSync('tooling/performance/inventory.mjs','utf8');
  const admission=source.indexOf('inspectInventoryOutput(out)');
  expect(admission).toBeGreaterThan(-1);
  for(const marker of ['fs.existsSync(previousRegisterPath)','fs.readFileSync(previousRegisterPath']){
    expect(source.indexOf(marker)).toBeGreaterThan(admission);
  }
  expect(source).not.toMatch(/fs\.(mkdirSync|copyFileSync|writeFileSync)\(/);
});
it('writes fresh nested output without touching sibling sentinels',()=>{
  const f=fixture();const out=path.join(f.out,'nested');output.writeInventoryOutput(out,stamp,payload('new:'));
  for(const[name,value]of Object.entries(payload('new:')))expect(fs.readFileSync(path.join(out,name),'utf8')).toBe(value);
  expect(fs.readdirSync(path.join(out,'history',stamp))).toEqual([]);
  expect(fs.readFileSync(path.join(f.sibling,'sentinel'),'utf8')).toBe('unchanged');
});
it('backs up exact previous bytes, updates four outputs and preserves unrelated files',()=>{
  const f=fixture();seed(f.out);fs.writeFileSync(path.join(f.out,'unrelated'),'leave');
  output.writeInventoryOutput(f.out,stamp,payload('new:'));
  unchanged(path.join(f.out,'history',stamp));
  for(const[name,value]of Object.entries(payload('new:')))expect(fs.readFileSync(path.join(f.out,name),'utf8')).toBe(value);
  expect(fs.readFileSync(path.join(f.out,'unrelated'),'utf8')).toBe('leave');
});
it('preserves a partial old register and its acceptance hold in both new outputs',()=>{
  const f=fixture();fs.mkdirSync(f.out);const old=JSON.stringify({currentAcceptanceQualification:qualification});
  fs.writeFileSync(path.join(f.out,'ADOPTION_REGISTER.json'),old);
  const held=helper.preservedAcceptanceQualification(JSON.parse(fs.readFileSync(output.inspectInventoryOutput(f.out)['ADOPTION_REGISTER.json'],'utf8')));
  output.writeInventoryOutput(f.out,stamp,{...payload('new:'),'ADOPTION_REGISTER.json':JSON.stringify({currentAcceptanceQualification:held}),'ADOPTION.md':helper.qualificationMarkdown(held)});
  expect(fs.readFileSync(path.join(f.out,'history',stamp,'ADOPTION_REGISTER.json'),'utf8')).toBe(old);
  expect(fs.readdirSync(path.join(f.out,'history',stamp))).toEqual(['ADOPTION_REGISTER.json']);
  expect(JSON.parse(fs.readFileSync(path.join(f.out,'ADOPTION_REGISTER.json'),'utf8')).currentAcceptanceQualification).toEqual(qualification);
  expect(fs.readFileSync(path.join(f.out,'ADOPTION.md'),'utf8')).toBe(helper.qualificationMarkdown(qualification));
});
it.each(['root','ancestor','history','snapshot','dangling-history'])('rejects redirected directory %s before any replacement',kind=>{
  const f=fixture();let out=f.out;
  if(kind==='root')link(f,out,f.sibling,'dir');
  else if(kind==='ancestor'){link(f,out,f.sibling,'dir');out=path.join(out,'child');}
  else {seed(out);const history=path.join(out,'history');if(kind==='history'||kind==='dangling-history')link(f,history,kind==='history'?f.sibling:path.join(f.sibling,'absent'),'dir');else{fs.mkdirSync(history);link(f,path.join(history,stamp),f.sibling,'dir');}}
  expect(()=>output.inspectInventoryOutput(out,stamp)).toThrow();
  expect(()=>output.writeInventoryOutput(out,stamp,payload('new:'))).toThrow();
  expect(fs.readFileSync(path.join(f.sibling,'sentinel'),'utf8')).toBe('unchanged');
  if(kind!=='root'&&kind!=='ancestor')unchanged(out);
});
it.for(output.inventoryFiles.flatMap(name=>[{name,dangling:false},{name,dangling:true}]))('rejects file-link $name dangling=$dangling before previous register reading',({name,dangling},context)=>{
  const f=fixture();fs.mkdirSync(f.out);const target=path.join(f.sibling,dangling?'absent':'sentinel');
  try { link(f,path.join(f.out,name),target,'file'); }
  catch(error) {
    if(process.platform==='win32'&&(error as NodeJS.ErrnoException).code==='EPERM') {
      context.skip('Platform gate: Windows file-symlink creation is denied; this case is NOT verified. Run on a permitted host.');
      return;
    }
    throw error;
  }
  expect(()=>output.inspectInventoryOutput(f.out)).toThrow();
  expect(()=>output.writeInventoryOutput(f.out,stamp,payload('new:'))).toThrow();
  expect(fs.existsSync(path.join(f.sibling,'absent'))).toBe(false);expect(fs.readFileSync(path.join(f.sibling,'sentinel'),'utf8')).toBe('unchanged');
});
it.each(output.inventoryFiles)('rejects hard-linked output %s',name=>{
  const f=fixture();fs.mkdirSync(f.out);fs.linkSync(path.join(f.sibling,'sentinel'),path.join(f.out,name));
  expect(()=>output.inspectInventoryOutput(f.out)).toThrow();
  expect(()=>output.writeInventoryOutput(f.out,stamp,payload('new:'))).toThrow();
  expect(fs.readFileSync(path.join(f.sibling,'sentinel'),'utf8')).toBe('unchanged');
});
it.each(['directory','file'])('does not reuse an existing timestamp %s',kind=>{
  const f=fixture();seed(f.out);fs.mkdirSync(path.join(f.out,'history'));const target=path.join(f.out,'history',stamp);
  if(kind==='directory'){fs.mkdirSync(target);fs.writeFileSync(path.join(target,'sentinel'),'leave');}else fs.writeFileSync(target,'leave');
  expect(()=>output.writeInventoryOutput(f.out,stamp,payload('new:'))).toThrow();unchanged(f.out);
  expect(fs.readFileSync(kind==='directory'?path.join(target,'sentinel'):target,'utf8')).toBe('leave');
});
it.each(['relative','bad-stamp','missing','extra','nonstring','ancestor-file','artifact-directory'])('rejects invalid input %s without creating history',kind=>{
  const f=fixture();let out=f.out;let snapshot=stamp;const values:Record<string,unknown>=payload('new:');
  if(kind==='relative')out='relative-inventory-output';
  if(kind==='bad-stamp')snapshot='../escape';
  if(kind==='missing')delete values['ADOPTION.md'];
  if(kind==='extra')values['../escape']='no';
  if(kind==='nonstring')values['ADOPTION.md']=null;
  if(kind==='ancestor-file'){fs.writeFileSync(f.out,'leave');out=path.join(f.out,'child');}
  if(kind==='artifact-directory'){fs.mkdirSync(f.out);fs.mkdirSync(path.join(f.out,'ADOPTION_REGISTER.json'));}
  expect(()=>output.writeInventoryOutput(out,snapshot,values as Record<string,string>)).toThrow();
  expect(fs.existsSync(path.join(f.out,'history'))).toBe(false);
});
it('exclusive second-backup collision retains the partial snapshot and never replaces current files',()=>{
  const f=fixture();seed(f.out);const actual=fs.copyFileSync;let calls=0;
  vi.spyOn(fs,'copyFileSync').mockImplementation((source,destination,flags)=>{
    if(++calls===2)fs.writeFileSync(destination,'collision',{flag:'wx'});
    return actual(source,destination,flags);
  });
  expect(()=>output.writeInventoryOutput(f.out,stamp,payload('new:'))).toThrow();
  expect(calls).toBe(2);unchanged(f.out);
  expect(fs.readFileSync(path.join(f.out,'history',stamp,output.inventoryFiles[0]),'utf8')).toBe('old:'+output.inventoryFiles[0]);
  expect(fs.readFileSync(path.join(f.out,'history',stamp,output.inventoryFiles[1]),'utf8')).toBe('collision');
});
