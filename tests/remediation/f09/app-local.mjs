import {guard,runtime,sql,root} from './full-db.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
guard();
const k=JSON.parse(fs.readFileSync(path.join(runtime,'keys-private.json'),'utf8'));
assert.equal(k.API_URL,'http://127.0.0.1:16521');
assert.equal(sql("select count(*) from public.erp_email_provider_configs where secret_ref is not null;"),'0');
const env={...process.env,NODE_OPTIONS:'--use-system-ca --max-old-space-size=8192',
 NEXT_PUBLIC_SUPABASE_URL:k.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:k.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:k.SERVICE_ROLE_KEY,
 NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:16509',SITE_URL:'http://127.0.0.1:16509',
 F09_EMAIL_WORKER_ENABLED:'false',F09_EMAIL_TRIGGER_ENABLED:'false',OUTPUT_SCHEDULES_WORKER_ENABLED:'false',
 OUTPUT_SCHEDULES_UI_ENABLED:'true',
 NEXT_TELEMETRY_DISABLED:'1'};
// Next development traces may include action arguments. Keep synthetic-session
// logs private rather than echoing credentials into terminal/chat output.
const log=fs.openSync(path.join(runtime,'dev-server-private.log'),'a');
const p=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','16509'],{cwd:root,env,stdio:['ignore',log,log],windowsHide:true});
console.log('F09 local-only server starting at http://127.0.0.1:16509; worker flags disabled.');
p.on('exit',code=>process.exitCode=code??1);
