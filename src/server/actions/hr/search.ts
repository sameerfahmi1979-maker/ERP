"use server";
import {z} from 'zod';
import {readHrSearch} from '@/server/reads/hr-search';
import {hrSearchFullCriteriaSchema,hrSearchPageReadSchema,hrSearchSuggestionsReadSchema} from '@/lib/reads/hr-search-read-schema';
import type {HrSearchInput,HrSearchOutput,HrSearchSuggestion} from '@/lib/hr/search/types';

const fields=hrSearchFullCriteriaSchema.shape;
const legacyInput=z.object({query:fields.query,categories:fields.categories,ownerCompanyId:fields.ownerCompanyId,branchId:fields.branchId,departmentId:fields.departmentId,designationId:fields.designationId,workSiteId:fields.workSiteId,status:fields.status,dateFrom:fields.dateFrom,dateTo:fields.dateTo,
 limit:z.number().int().min(1).max(100).default(50),offset:z.number().int().min(0).max(9999999).default(0)}).strict();
/** Retain the callable offset contract, not the old capped/partial-error fork.
 * At most two validated current pages cover any <=100-row offset window.
 * Counts/grouping must agree across pages; a failure never becomes empty work. */
export async function searchHr(input:HrSearchInput):Promise<HrSearchOutput>{
 const {limit,offset,...criteria}=legacyInput.parse(input);
 const query=criteria.query.trim(),page=Math.floor(offset/100)+1,start=offset%100;
 const read=async(index:number)=>{const r=await readHrSearch({...criteria,query,mode:'results',page:index,pageSize:100});if(!r.success)throw Error('HR search unavailable or restricted');return hrSearchPageReadSchema.parse(r.data);};
 const first=await read(page);const results=first.results.slice(start,start+limit);
 if(results.length<limit&&offset+results.length<first.totalCount){
  const second=await read(page+1);
  if(second.totalCount!==first.totalCount||JSON.stringify(second.groupCounts)!==JSON.stringify(first.groupCounts))throw Error('HR search changed; refresh before retrying');
  results.push(...second.results.slice(0,limit-results.length));
 }
 if(results.length!==Math.min(limit,Math.max(0,first.totalCount-offset))||new Set(results.map(r=>r.id)).size!==results.length)throw Error('Incomplete HR search rejected');
 return {results,totalCount:first.totalCount,groupCounts:first.groupCounts,query,hasMore:offset+results.length<first.totalCount};
}
export async function getHrSearchSuggestions(prefix:string):Promise<HrSearchSuggestion[]>{
 const query=z.string().trim().max(200).parse(prefix);if(query.length<2)return[];
 const result=await readHrSearch({mode:'suggestions',query});if(!result.success)throw Error('HR suggestions unavailable or restricted');
 return hrSearchSuggestionsReadSchema.parse(result.data).rows;
}
