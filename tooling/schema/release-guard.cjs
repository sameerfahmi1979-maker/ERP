'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function canonical(x){return Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;}
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
/** No SQL execution. Call immediately before separately authorised deployment. */
function verifyBaseline(manifest, history, catalog){
 if(manifest.strategy!=='verified-schema-baseline' || !Array.isArray(history.rows))throw Error('Unrecognised baseline or history');
 const expected=manifest.applied.map(r=>({version:r.version,sha256:r.sha256}));
 const actual=history.rows.map(r=>({version:r.version,sha256:r.sha256}));
 if(digest(expected)!==digest(actual))throw Error('Applied history changed: reconciliation and approval required; never automatically repair it');
 for(const [section,expectedHash] of Object.entries(manifest.catalog))if(digest(catalog[section])!==expectedHash)throw Error(`Schema drift in ${section}: refresh the reviewed baseline before release`);
 return {pass:true,automatic_legacy_replay:false,approved_pending_migrations:0};
}
module.exports={verifyBaseline,digest};
if(require.main===module){
 const [historyFile,catalogFile]=process.argv.slice(2);
 if(!historyFile||!catalogFile||process.argv.length!==4)throw Error('Usage: node tooling/schema/release-guard.cjs <fresh-history-index.json> <fresh-catalog.json>');
 const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 console.log(JSON.stringify(verifyBaseline(read(path.join(__dirname,'baseline-manifest.json')),read(historyFile),read(catalogFile))));
}
