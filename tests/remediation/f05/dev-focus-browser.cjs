'use strict';
// Actual Next/Turbopack + StrictMode using exact copied ALGT provider/dialog source.
// Generated fixture has no ERP routes, credentials, database client or external requests.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),net=require('node:net'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..'),evidence=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F05/UI-00/keyborg-20260930');
const stage=process.argv[2];assert.ok(['before','after'].includes(stage));
const port=16409,origin='http://127.0.0.1:'+port;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 fs.mkdirSync(evidence,{recursive:true});
 for(const ext of ['json','log']){const previous=path.join(evidence,'DEV_'+stage.toUpperCase()+'.'+ext);if(fs.existsSync(previous))fs.copyFileSync(previous,path.join(evidence,'attempt-'+Date.now()+'-'+stage+'.'+ext));}
 await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});
 const target=path.join(evidence,'dev-'+stage+'-'+Date.now());fs.mkdirSync(target,{recursive:true});
 fs.cpSync(path.join(__dirname,'dev-fixture'),target,{recursive:true});
 const sources=['src/components/design-system/fluent-provider.tsx','src/components/design-system/algt-dialog.tsx','src/components/layout/theme-provider.tsx'];
 const hashes=[];
 for(const file of sources){const bytes=fs.readFileSync(path.join(root,file));fs.writeFileSync(path.join(target,'components',path.basename(file)),bytes);hashes.push({file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
 fs.symlinkSync(path.join(root,'node_modules'),path.join(target,'node_modules'),'junction');
 assert.equal(fs.realpathSync(path.join(target,'node_modules')),fs.realpathSync(path.join(root,'node_modules')));
 assert.ok(!fs.readdirSync(target).some(f=>f.startsWith('.env')));
 const env={};for(const key of ['PATH','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA'])if(process.env[key])env[key]=process.env[key];
 Object.assign(env,{NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',F05_REPO_ROOT:root,NODE_OPTIONS:'--use-system-ca --no-experimental-webstorage --max-old-space-size=8192'});
 const log=fs.openSync(path.join(evidence,'DEV_'+stage.toUpperCase()+'.log'),'w');
 const child=cp.spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--turbopack','--hostname','127.0.0.1','--port',String(port)],{cwd:target,env,windowsHide:true,stdio:['ignore',log,log]});
 const cases=[],errors=[],warnings=[],pageErrors=[],external=[];let browser;
 try{
  let ready=false;for(let n=0;n<120;n++){if(child.exitCode!==null)throw Error('Dev server exited; see DEV log');try{const r=await fetch(origin,{signal:AbortSignal.timeout(2000)});if(r.ok){ready=true;break;}}catch{}await delay(500);}assert.ok(ready,'Local dev server did not become ready');
  browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin){external.push(u.origin);return r.abort();}return r.continue();});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});page.on('pageerror',e=>pageErrors.push(e.message));
  async function check(name,fn){await fn();cases.push({name,status:'PASS'});console.log('PASS '+name);}
  await page.goto(origin);await page.getByRole('heading',{name:'ALGT focus lifecycle regression'}).waitFor();
  await check('StrictMode provider mounts in actual Next Turbopack development server',async()=>assert.ok(await page.getByRole('button',{name:'Open test dialog',exact:true}).isVisible()));
  await check('Dialog keyboard focus containment, Escape and trigger return across three cycles',async()=>{
   for(let n=0;n<3;n++){
    const trigger=page.getByRole('button',{name:'Open test dialog',exact:true});await trigger.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:'Focus test'});await dialog.waitFor();
    await page.getByRole('textbox',{name:'Synthetic draft'}).fill('LOCAL FOCUS TEST');
    for(let i=0;i<7;i++){await page.keyboard.press('Tab');assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));}
    for(let i=0;i<3;i++){await page.keyboard.press('Shift+Tab');assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));}
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.ok(await trigger.evaluate(el=>el===document.activeElement));
   }
  });
  await check('Menu opens and arrow-key selection and Escape work',async()=>{const trigger=page.getByRole('button',{name:'Open test menu'});await trigger.focus();await page.keyboard.press('Enter');await page.getByRole('menu').waitFor();await page.keyboard.press('ArrowDown');assert.ok(await page.getByRole('menu').evaluate(el=>el.contains(document.activeElement)));await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'hidden'});assert.ok(await trigger.evaluate(el=>el===document.activeElement));});
  await check('Theme changes keep an open dialog and its draft',async()=>{await page.getByRole('button',{name:'Toggle theme',exact:true}).click();await page.getByRole('button',{name:'Open test dialog',exact:true}).click();await page.getByRole('textbox',{name:'Synthetic draft'}).fill('PRESERVED LOCAL DRAFT');await page.getByRole('button',{name:'Toggle dialog theme',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Synthetic draft'}).inputValue(),'PRESERVED LOCAL DRAFT');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});});
  await check('Repeated keyed remount and complete mount/unmount do not break controls',async()=>{for(let i=0;i<4;i++){await page.getByRole('button',{name:'Remount provider',exact:true}).click();await page.getByRole('button',{name:'Open test dialog',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});}await page.getByRole('button',{name:'Toggle provider mount',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Open test dialog',exact:true}).count(),0);await page.getByRole('button',{name:'Toggle provider mount',exact:true}).click();await page.getByRole('button',{name:'Open test dialog',exact:true}).waitFor();});
  await check('Client route away/return and hard reload remount cleanly',async()=>{await page.getByRole('link',{name:'Go to second route'}).click();await page.getByRole('heading',{name:'Second test route'}).waitFor();await page.getByRole('link',{name:'Return to focus test'}).click();await page.getByRole('heading',{name:'ALGT focus lifecycle regression'}).waitFor();await page.reload();await page.getByRole('button',{name:'Open test dialog',exact:true}).waitFor();});
  await check('Fast Refresh of the copied provider preserves the draft and keyboard behavior',async()=>{
   await page.getByRole('button',{name:'Open test dialog',exact:true}).click();await page.getByRole('textbox',{name:'Synthetic draft'}).fill('HOT REFRESH DRAFT');
   const file=path.join(target,'components/fluent-provider.tsx'),source=fs.readFileSync(file,'utf8');
   // Mechanical edit of generated fixture only; original application source is unchanged.
   fs.writeFileSync(file,source.replace('className="algt-fluent-root"','className="algt-fluent-root refreshed-fixture"'));
   await page.locator('.refreshed-fixture').first().waitFor({timeout:60000});assert.equal(await page.getByRole('textbox',{name:'Synthetic draft'}).inputValue(),'HOT REFRESH DRAFT');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  });
  await check('Keyboard focus indicator still appears',async()=>{await page.getByRole('button',{name:'Open test dialog',exact:true}).focus();await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement?.hasAttribute('data-fui-focus-visible')));});
  await page.screenshot({path:path.join(evidence,'DEV_'+stage.toUpperCase()+'.png'),fullPage:true});
 }catch(e){cases.push({name:'Journey failure',status:'FAIL',error:e.message});process.exitCode=1;}
 finally{
  if(browser)await browser.close();
  // Kill only this tool-created process tree, never the user's local server.
  if(child.pid)cp.spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{encoding:'utf8',windowsHide:true});fs.closeSync(log);
  const result={at:new Date().toISOString(),stage,target:origin,fixture:target,sources:hashes,cases,errors,warnings,pageErrors,external,strict_mode:true,turbopack:true,production_requests:0,database_requests:0};
  fs.writeFileSync(path.join(evidence,'DEV_'+stage.toUpperCase()+'.json'),JSON.stringify(result,null,2));
  const keyborg=errors.filter(e=>/Keyborg instance .*disposed incorrectly/.test(e));console.log(JSON.stringify({stage,cases:cases.length,failed:cases.filter(c=>c.status==='FAIL').length,keyborg_errors:keyborg.length,other_errors:errors.length-keyborg.length,warnings:warnings.length,page_errors:pageErrors.length}));
  if(stage==='after'&&(errors.length||warnings.length||pageErrors.length||external.length))process.exitCode=1;
  if(stage==='before'&&!keyborg.length)process.exitCode=1;
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
