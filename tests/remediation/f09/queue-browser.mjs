// Isolated real-Chrome regression; never use a production URL or provider.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { guard, runtime } from './full-db.mjs';
guard();
const origin='http://127.0.0.1:16509';
const keys=JSON.parse(fs.readFileSync(path.join(runtime,'keys-private.json'),'utf8'));
assert.equal(keys.API_URL,'http://127.0.0.1:16521');
const fixture=JSON.parse(fs.readFileSync(path.join(runtime,'fixtures-private.json'),'utf8'));
const db=createClient(keys.API_URL,keys.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
assert.equal((await db.from('erp_email_provider_configs').select('id',{count:'exact',head:true}).not('secret_ref','is',null)).count,0);
const marker='F09_UI_'+randomUUID();
const record={marker,ids:[],checks:[],errors:0,cleanup:'pending',realEmailsSent:0};
const recordFile=path.join(runtime,marker+'.json');
const save=()=>fs.writeFileSync(recordFile,JSON.stringify(record,null,2));
save();
const inserted=await db.from('erp_email_queue').insert(Array.from({length:225},(_,index)=>({
  source_module:marker,created_by:fixture.actors.operator.profileId,to_emails:['f09@example.invalid'],
  subject:marker+' item '+String(index).padStart(3,'0'),text_body:'Synthetic UI only',status:'pending',
  paused_at:new Date().toISOString(),scheduled_for:'2099-01-01T00:00:00Z',
}))).select('id');assert.equal(inserted.error,null);record.ids=inserted.data.map(r=>r.id);save();
let browser, page;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return [origin,keys.API_URL].includes(url.origin)?route.continue():route.abort();
  });
  page=await context.newPage();page.setDefaultTimeout(60000);
  page.on('pageerror',()=>{record.errors++;});
  await page.goto(origin+'/login');
  await page.locator('input[type=email]').fill(fixture.actors.operator.email);
  await page.locator('input[type=password]').fill(fixture.actors.operator.password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.waitForURL(url=>!url.pathname.includes('login'),{timeout:60000});
  record.checks.push('synthetic_operator_login');
  await page.goto(origin+'/admin/notifications/email-queue');
  await page.getByRole('heading',{name:'Email Queue',exact:true}).waitFor();
  const total=(await db.from('erp_email_queue').select('id',{count:'exact',head:true}).is('deleted_at',null)).count;
  await page.getByText(new RegExp(total+' total,')).waitFor();record.checks.push('whole_queue_count_above_200');
  await page.getByLabel('Search queue by subject, queue code or ID').fill(marker);
  await page.getByText('1–25 of 225',{exact:true}).waitFor();record.checks.push('server_search_full_set');
  await page.getByRole('button',{name:'Last page',exact:true}).click();
  await page.getByText('201–225 of 225',{exact:true}).waitFor();record.checks.push('last_page_beyond_old_cap');
  await page.getByRole('button',{name:'First page',exact:true}).click();
  await page.getByText('1–25 of 225',{exact:true}).waitFor();record.checks.push('first_page_restored');
  await page.getByLabel('Search queue by subject, queue code or ID').fill(marker+' item 224');
  await page.getByText('1–1 of 1',{exact:true}).waitFor();record.checks.push('exact_subject_search');
  assert.equal(await page.getByRole('button',{name:'Process eligible item',exact:true}).count(),0);record.checks.push('paused_rows_not_processable');
  await page.screenshot({path:path.join(runtime,marker+'.png'),fullPage:true});
  await context.close();
  const restricted=await browser.newContext();const restrictedPage=await restricted.newPage();
  await restricted.route('**/*',route=>[origin,keys.API_URL].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
  await restrictedPage.goto(origin+'/login');
  await restrictedPage.locator('input[type=email]').fill(fixture.actors.scoped.email);
  await restrictedPage.locator('input[type=password]').fill(fixture.actors.scoped.password);
  await restrictedPage.getByRole('button',{name:'Sign in',exact:true}).click();
  await restrictedPage.waitForURL(url=>!url.pathname.includes('login'),{timeout:60000});
  await restrictedPage.goto(origin+'/admin/notifications/email-queue');
  await restrictedPage.waitForURL('**/access-denied');record.checks.push('independent_scoped_session_denied');
  await restricted.close();
  assert.equal(record.errors,0);record.checks.push('no_page_errors_observed');
}catch(error){
  if(page&&!page.isClosed())await page.screenshot({path:path.join(runtime,marker+'-failure.png'),fullPage:true}).catch(()=>{});
  throw error;
}finally{
  if(browser)await browser.close();
  const removed=await db.from('erp_email_queue').delete().eq('source_module',marker).in('id',record.ids).select('id');
  assert.equal(removed.error,null);assert.equal(removed.data.length,record.ids.length);
  record.cleanup='all_225_exact_owned_rows_removed';save();
}
console.log(JSON.stringify({checks:record.checks.length,errors:record.errors,cleanup:record.cleanup,realEmailsSent:0,evidence:path.basename(recordFile)}));
