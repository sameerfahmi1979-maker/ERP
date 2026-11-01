import type { PreparationEvidence } from "./contracts";

export type ComparableFact = { key: string; value: string | null; kind?: "text" | "date" | "identifier" | "quantity" | "money"; unit?: string | null; currency?: string | null; evidence: PreparationEvidence[] };
type RetainedPassage = {fileId:number;versionId:number;sha256?:string|null;text:string|null};
export type ComparableSource = { documentId: number; versionId: number; sourceHash: string; subjectKey: string | null; facts: ComparableFact[]; complete: boolean; passages?:RetainedPassage[] };
/** Literal, bounded excerpt alignment. This does not interpret legal meaning. */
export function compareRetainedPassages(left:ComparableSource,right:ComparableSource){
  const collect=(source:ComparableSource)=>{
    const excerpts:Array<{fileId:number;versionId:number;sha256:string|null;text:string}>=[];let complete=source.complete;
    for(const p of source.passages??[]){if(p.text===null){complete=false;continue;}for(const line of p.text.split(/\r?\n/)){if(!line.trim())continue;const points=Array.from(line);for(let i=0;i<points.length;i+=1000){if(excerpts.length===200){complete=false;break;}excerpts.push({fileId:p.fileId,versionId:p.versionId,sha256:p.sha256??null,text:points.slice(i,i+1000).join("")});}if(excerpts.length===200){complete=false;break;}}}
    return {excerpts,complete};
  };
  const a=collect(left),b=collect(right),n=a.excerpts.length,m=b.excerpts.length;
  if(!n||!m)return {state:"unavailable" as const,complete:false,changes:[] as Array<{source:"first"|"second";excerpt:typeof a.excerpts[number]}>};
  const key=(value:string)=>value.trim().replace(/\s+/g," ");
  const aKeys=a.excerpts.map(x=>key(x.text)),bKeys=b.excerpts.map(x=>key(x.text));
  const grid=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)grid[i][j]=aKeys[i]===bKeys[j]?1+grid[i+1][j+1]:Math.max(grid[i+1][j],grid[i][j+1]);
  const changes:Array<{source:"first"|"second";excerpt:typeof a.excerpts[number]}>=[];let i=0,j=0;
  while(i<n||j<m){if(i<n&&j<m&&aKeys[i]===bKeys[j]){i++;j++;}else if(i<n&&(j===m||grid[i+1][j]>=grid[i][j+1]))changes.push({source:"first",excerpt:a.excerpts[i++]});else changes.push({source:"second",excerpt:b.excerpts[j++]});}
  const complete=a.complete&&b.complete&&changes.length<=40;
  return {state:complete?(changes.length?"different" as const:"same_retained_text" as const):"partial" as const,complete,changes:changes.slice(0,40)};
}
/** Exact selected sources only. Similar names and missing values never establish equivalence. */
export function comparePreparedSources(left: ComparableSource, right: ComparableSource) {
  const keys = [...new Set([...left.facts, ...right.facts].map(f => f.key))].sort();
  return { sources: [left, right].map(s => ({ documentId: s.documentId, versionId: s.versionId, sourceHash: s.sourceHash })),
    complete: left.complete && right.complete,
    passageComparison:compareRetainedPassages(left,right),
    identity: left.subjectKey && left.subjectKey === right.subjectKey ? "same_verified_subject" as const : "unresolved" as const,
    differences: keys.map(key => {
      const a = left.facts.find(f => f.key === key), b = right.facts.find(f => f.key === key);
      const missing = !a?.value || !b?.value || ([a, b].some(f => f?.kind === "quantity" && !f.unit || f?.kind === "money" && !f.currency));
      const comparable = !missing && (a?.unit ?? null) === (b?.unit ?? null) && (a?.currency ?? null) === (b?.currency ?? null);
      return { key, left: a ?? null, right: b ?? null, status: missing ? "incomplete" as const : !comparable ? "different_units_or_currency" as const : a!.value === b!.value ? "same" as const : "different" as const };
    }) };
}

export function consistencyFindingIdentity(rule: string, subjectKey: string, sources: ComparableSource[]) {
  // Canonical material is hashed at the server boundary. No name-based identity.
  return JSON.stringify({ version: 1, rule, subjectKey, sources: sources.map(s => ({ documentId: s.documentId, versionId: s.versionId, sourceHash: s.sourceHash })).sort((a, b) => a.documentId - b.documentId || a.versionId - b.versionId) });
}
