// Reproducible static coverage/disposition; runtime receipts are separately named.
import {inventorySource} from './foundation-inventory.mjs';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const digest=v=>createHash('sha256').update(v).digest('hex');
export const SEARCH_FAMILIES=[
 {id:'M02-DMS-LIST',files:['src/server/reads/dms-documents.ts','src/features/dms/documents/dms-documents-table.tsx','src/server/actions/dms/ai-search.ts','src/server/actions/dms/semantic-search.ts'],adapter:'shared authorized document kernel; existing gated AI/semantic suggestions are intersected',evidence:['FINAL_ACCEPTANCE.log','NATIVE_SEARCH_RESULT.json']},
 {id:'M02-DMS-BROWSER',files:['src/server/reads/dms-browser.ts','src/features/dms/browser/dms-browser-page-client.tsx','src/hooks/use-dms-browser.ts','src/lib/reads/dms-browser-schema.ts'],adapter:'same document kernel and current filters; exact native page plus explicitly bounded suggestions',evidence:['FINAL_ACCEPTANCE.log','NATIVE_SEARCH_RESULT.json']},
 {id:'M02-HR-BROWSER',files:['src/server/reads/hr-document-browser.ts','src/features/hr/document-browser/hr-doc-browser-page-client.tsx'],adapter:'exact selected subject and existing HR union; DMS matching delegates to same kernel',evidence:['FINAL_ACCEPTANCE.log','NATIVE_SEARCH_RESULT.json']},
 {id:'M02-HR-SEARCH',files:['src/server/reads/hr-search.ts','src/server/ai/search/hr-meaning.ts','src/features/hr/search/hr-search-page-client.tsx'],adapter:'existing category-specific owning reads; actual HR types and shared exact subject resolver',evidence:['FINAL_ACCEPTANCE.log']},
 {id:'M02-GLOBAL',files:['src/lib/ai/common/search/search-engine.ts','src/server/actions/ai/common/search.ts','src/features/ai/common/search/search-page-client.tsx','src/app/(protected)/search/page.tsx'],adapter:'native global service and current domain permission/RLS; canonical business links',evidence:['FINAL_ACCEPTANCE.log','NATIVE_SEARCH_RESULT.json']},
 {id:'M02-LINK-SELECTORS',files:['src/lib/dms/search-link-entity-options.ts','src/server/reads/dms-entity-documents.ts'],adapter:'registered entity type, conjunctive literal matching; native parent/domain contracts retained',evidence:['FINAL_ACCEPTANCE.log']},
 {id:'M02-APPROVAL-READ',files:['src/server/reads/dms-approvals.ts','src/server/ai/search/approval-status.ts','src/app/api/v1/search/approval-status/route.ts'],adapter:'owning status/history; current self-approval hints denied; mapping and delivery holds remain explicit',evidence:['FINAL_ACCEPTANCE.log']},
 {id:'M02-API',prefixes:['src/server/ai/search/','src/lib/ai/search/','src/app/api/v1/search/'],files:['src/server/actions/ai/search-candidates.ts'],adapter:'foundation erp-ai/1 contract, typed filters/current authority, fresh pages and source provenance',evidence:['FINAL_ACCEPTANCE.log','NATIVE_SEARCH_RESULT.json']},
];
export function classifyConsumer(c){
 const family=SEARCH_FAMILIES.find(f=>f.files?.includes(c.path)||f.prefixes?.some(p=>c.path.startsWith(p)));
 if(family)return {familyId:family.id,disposition:'adopted_or_supporting_source',reason:family.adapter,evidence:family.evidence};
 if(['upload','review'].includes(c.kind))return {familyId:'AI-MOD-04',disposition:'later_stage_upload_review_contract_preserved',reason:'Upload, approval write and re-review adoption is stage 4; this stage exposes read status only.'};
 if(c.kind==='form')return {familyId:'AI-MOD-03/04',disposition:'existing_form_contract_preserved',reason:'AI suggestions/apply do not gain authority from a search adapter.'};
 if(/\/ai\/common\/search\/collectors\//.test(c.path))return {familyId:'M02-RETIRED-COLLECTORS',disposition:'not_used_by_current_search_engine',reason:'The common search entry now delegates to the shared native service; retained helper source is not new runtime adoption.'};
 if(/assistant|\/ai\//i.test(c.path)||c.kind==='ai_consumer')return {familyId:'AI-MOD-03/04/05',disposition:'capability_owned_or_later_stage',reason:'Existing Assistant, analysis, provider, review or operations capability retains its owning access and declared stage; no unrestricted adapter is activated.'};
 if(/navigation|sidebar|command|search-params|route|global-search/i.test(c.path)||c.kind==='screen')return {familyId:'DOMAIN-NAVIGATION',disposition:'navigation_or_existing_screen',reason:'Route/navigation or screen inventory is not an ERP business-data question; existing access checks remain.'};
 return {familyId:'DOMAIN-LOCAL',disposition:'owning_list_or_selector_contract_preserved',reason:'Local list/form selection stays with its existing permission, required predicates and pagination. Cross-domain question capabilities require explicit registered domain adapters; no implicit read/write grant.'};
}
export function captureSearchAdoption(root,output){
 mkdirSync(output,{recursive:true});const current=inventorySource(root);
 const oldPath=join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/AI_MOD_01_20261030/SOURCE_INVENTORY.json');
 const old=JSON.parse(readFileSync(oldPath,'utf8'));const byId=new Map(current.consumers.map(c=>[c.id,c]));
 const combined=new Map([...old.consumers,...current.consumers].map(c=>[c.id,c]));
 const rows=[...combined.values()].map(c=>({...c,presentInCurrentSource:byId.has(c.id),...classifyConsumer(c),sourceSha256:current.sources.find(s=>s.path===c.path)?.sha256??null})).sort((a,b)=>a.id.localeCompare(b.id));
 const deltas={added:current.consumers.filter(c=>!old.consumers.some(o=>o.id===c.id)).map(c=>c.id),retired:old.consumers.filter(c=>!byId.has(c.id)).map(c=>({id:c.id,path:c.path,owner:c.owner,symbol:c.symbol,reason:'source anchor changed or removed; old record retained, never counted as current runtime adoption'}))};
 const groups=SEARCH_FAMILIES.map(f=>({...f,files:(f.files??[]).map(path=>({path,present:existsSync(join(root,path)),sha256:existsSync(join(root,path))?digest(readFileSync(join(root,path))):null})),consumerIds:rows.filter(r=>r.familyId===f.id&&r.presentInCurrentSource).map(r=>r.id)}));
 if(groups.some(g=>g.files.some(f=>!f.present)))throw Error('Missing required adoption source');
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Duplicate stable consumer');
 writeFileSync(join(output,'CURRENT_SOURCE_INVENTORY.json'),JSON.stringify(current,null,2)+'\n');
 writeFileSync(join(output,'CALLER_ADOPTION_REGISTER.json'),JSON.stringify({version:'ai-mod02-adoption/1',rows,groups,deltas,limits:['Dispositions cover every current and prior stable identifier; inventory is not runtime acceptance.','Only the adopted families have new stage-2 runtime evidence. Other families keep their existing owning contract or explicit later-stage hold.']},null,2)+'\n');
 const summary={sourceFiles:current.sources.length,currentConsumers:current.consumers.length,trackedConsumers:rows.length,newConsumers:deltas.added.length,retiredConsumers:deltas.retired.length,adoptedFamilies:groups.length,dispositions:Object.fromEntries([...new Set(rows.map(r=>r.disposition))].map(d=>[d,rows.filter(r=>r.disposition===d&&r.presentInCurrentSource).length]))};
 writeFileSync(join(output,'ADOPTION_SUMMARY.json'),JSON.stringify(summary,null,2)+'\n');return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=resolve('.');console.log(JSON.stringify(captureSearchAdoption(root,resolve(process.argv[2]??'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/AI_MOD_02_20261030'))));}
