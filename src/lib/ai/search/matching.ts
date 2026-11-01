import {literalContains} from "@/lib/reads/search";
/** Each word narrows the same owning read. Only server-owned columns are allowed. */
export function applySearchTerms<T extends {or(value:string):T}>(query:T,columns:readonly string[],text:string):T {
 const terms=text.trim().split(/\s+/).filter(Boolean);
 if(terms.length>40||text.length>500||!columns.length||columns.some(c=>!/^\w+(?:\.\w+)*$/.test(c)||c.split(".").some(part=>["__proto__","constructor","prototype"].includes(part))))throw Error("Invalid search text or fields");
 for(const term of terms)query=query.or(columns.map(column=>`${column}.ilike.${literalContains(term)}`).join(","));
 return query;
}
