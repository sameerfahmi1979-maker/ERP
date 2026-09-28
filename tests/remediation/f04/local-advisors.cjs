'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),db=require('../f00/local-db.cjs'),g=require('../f00/target-guard.cjs');
const dir=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04/continuation-20260928');
db.assertDatabase();g.assertWorkdir();
for(const [name,args] of [['ADVISORS',['db','advisors','--local','--type','all','--level','warn','--output','json']],['MIGRATION_HISTORY',['migration','list','--local']]]) {
 const r=cp.spawnSync('supabase.cmd',[...args,'--workdir',g.LOCAL],{windowsHide:true,encoding:'utf8',shell:true,timeout:120000,maxBuffer:8*1024*1024});
 fs.writeFileSync(path.join(dir,name+'.log'),(r.stdout??'')+(r.stderr??''));
 fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify({at:new Date().toISOString(),target:'algt-f00-local',exit_code:r.status,error:r.error?.code??null,local_only:true},null,2));
 console.log(JSON.stringify({name,exit_code:r.status,error:r.error?.code??null}));
}
