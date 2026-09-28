'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),db=require('../f00/local-db.cjs');
db.assertDatabase();
const rows=db.sql("select coalesce(json_agg(json_build_object('id',id,'code',branch_code)),'[]'::json) from public.branches where branch_code='F04-DRAFT-ONLY'",{json:true});
const receipt={at:new Date().toISOString(),target:'algt-f00-local',code:'F04-DRAFT-ONLY',persisted_rows:rows,production_writes:0};
fs.writeFileSync(path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04/complex-adapters-20260928/BROWSER_ROW_PROOF.json'),JSON.stringify(receipt,null,2));
assert.equal(rows.length,0,'Unexpected synthetic branch persisted; retain and reconcile ledger before cleanup');console.log(JSON.stringify(receipt));
