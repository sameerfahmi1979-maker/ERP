import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readHrAiReviewFacts} from '@/server/reads/hr-ai-review-facts';
type Row=Record<string,unknown>;
const state={tables:{}as Record<string,Row[]>,calls:[]as {table:string;columns:string;from:number;to:number}[],error:'',foreign:false,cap:false,change:false};
const db={from:(table:string)=>{let columns='';const q={select:(v:string)=>{columns=v;return q;},eq:()=>q,is:()=>q,order:()=>q,range:async(from:number,to:number)=>{
 state.calls.push({table,columns,from,to});let rows=state.tables[table]??[];
 if(state.change&&state.calls.filter(c=>c.table===table&&c.from===0).length>1)rows=rows.map(r=>({...r,expiry_date:'2026-09-01'}));
 const count=rows.length;rows=rows.slice(from,to+1);if(state.cap)rows=rows.slice(0,1);if(state.foreign)rows=rows.map(r=>({...r,employee_id:99}));
 return {data:rows,count,error:state.error===table?{message:'SYNTHETIC_PRIVATE'}:null};}};return q;}}as unknown as Parameters<typeof readHrAiReviewFacts>[0];
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T08:00:00Z'));Object.assign(state,{tables:{},calls:[],error:'',foreign:false,cap:false,change:false});});
afterEach(()=>vi.useRealTimers());
const dated=(id:number,expiry_date:string|null)=>({id,employee_id:8,expiry_date,status:'active'});
it('actual columns, complete two passes and dated counts replace obsolete/missing fields and guessed zeros',async()=>{
 state.tables.employee_identity_documents=[dated(1,'2026-10-23'),dated(2,'2026-11-01')];const r=await readHrAiReviewFacts(db,8,'compliance');expect(r.text).toContain('2 total, 1 expired, 1 expiring');expect(r.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);expect(state.calls).toHaveLength(8);expect(state.calls.some(c=>c.table==='employee_medical_insurances')).toBe(false);expect(state.calls.every(c=>!c.columns.includes('*'))).toBe(true);
});
it('complete paged counts include more than a provider page and never send raw medical/OCR/account values',async()=>{
 state.tables.employee_identity_documents=Array.from({length:1107},(_,i)=>({...dated(i+1,null),document_number:'PRIVATE_NUMBER',ocr_text:'PRIVATE_OCR'}));const r=await readHrAiReviewFacts(db,8,'compliance');expect(r.text).toContain('1107 total');expect(JSON.stringify(r)).not.toContain('PRIVATE');expect(state.calls.filter(c=>c.table==='employee_identity_documents')).toHaveLength(6);
});
it('medical aggregate is opt-in with no clinical fields',async()=>{
 state.tables.employee_medical_insurances=[dated(1,'2026-01-01')];const r=await readHrAiReviewFacts(db,8,'compliance',true);expect(r.text).toContain('Medical Insurance: 1 total, 1 expired');expect(state.calls.filter(c=>c.table==='employee_medical_insurances')).toHaveLength(2);
});
it.each(['error','foreign','cap','change']as const)('%s source cannot become an AI all-clear',async mode=>{
 state.tables.employee_identity_documents=[dated(1,'2026-10-23'),dated(2,'2026-11-01')];if(mode==='error')state.error='employee_identity_documents';else state[mode]=true;await expect(readHrAiReviewFacts(db,8,'compliance')).rejects.toThrow();
});
it('future blocks and saved ready checks never certify current deployability',async()=>{
 state.tables.employee_operational_blocks=[{id:1,employee_id:8,block_status:'active',effective_from:'2026-10-25',effective_to:null}];state.tables.employee_site_readiness=[{id:1,employee_id:8,readiness_status:'ready',checked_at:'2026-10-01T00:00:00Z',missing_requirements_json:['PRIVATE_CLINICAL']}];
 const r=await readHrAiReviewFacts(db,8,'readiness');expect(r.overallStatus).toBe('unknown');expect(r.text).toContain('Current active blocks: 0');expect(r.text).toContain('historical');expect(r.text).not.toContain('PRIVATE');expect(state.calls).toHaveLength(4);
});
it('actually effective restriction keeps blocked status independent of saved readiness',async()=>{
 state.tables.employee_operational_blocks=[{id:1,employee_id:8,block_status:'active',effective_from:'2026-10-24',effective_to:'2026-10-24'}];expect((await readHrAiReviewFacts(db,8,'readiness')).overallStatus).toBe('blocked');
});
