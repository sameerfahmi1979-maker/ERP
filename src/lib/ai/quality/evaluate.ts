import {datasetSchema,candidateSchema,observationsSchema,type QualityEvaluationResult} from './contracts';
/** Exact reference facts and citations are checked independently of JSON validity
 * or model confidence. Reviewed observations do not prove provider execution. */
export function evaluateReferenceCases(dataset:unknown,candidate:unknown,observations:unknown,baseline?:QualityEvaluationResult):QualityEvaluationResult{
 const d=datasetSchema.parse(dataset),c=candidateSchema.parse(candidate),o=observationsSchema.parse(observations);
 if(o.length!==d.cases.length||new Set(o.map(v=>v.caseId)).size!==o.length||o.some(v=>!d.cases.some(r=>r.caseId===v.caseId)))throw Error('Every original case must have exactly one observation.');
 if(baseline&&(baseline.total!==d.cases.length||baseline.cases.some(r=>!d.cases.some(v=>v.caseId===r.caseId))))throw Error('Compare the same dataset revision.');
 const set=(xs:string[])=>JSON.stringify([...new Set(xs)].sort());
 const cases=d.cases.map(r=>{const actual=o.find(v=>v.caseId===r.caseId)!;return {caseId:r.caseId,passed:actual.actual===r.expected&&set(actual.evidence)===set(r.evidence)};});
 const regressions=cases.filter(r=>!r.passed&&baseline?.cases.find(v=>v.caseId===r.caseId)?.passed).map(r=>r.caseId);
 const criticalFailures=d.cases.filter(r=>r.critical&&!cases.find(v=>v.caseId===r.caseId)!.passed).length;
 return {total:cases.length,passed:cases.filter(r=>r.passed).length,criticalFailures,regressions,cases,eligible:cases.every(r=>r.passed)&&!regressions.length,measurement:c.mode};
}
/** Feedback is untrusted text; never copy secret-shaped values into review datasets. */
export function minimizeCorrection(input:string):string{
 return input.replace(/-----BEGIN[\s\S]*?-----END[^\n]*-----/g,'[removed private key]')
 .replace(/\b(?:sk-(?:proj-)?|gh[pousr]_)[A-Za-z0-9_-]{15,}/g,'[removed credential]')
 .replace(/https?:\/\/\S+/gi,'[removed link]').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[removed email]')
 .replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,1000).trim();
}
