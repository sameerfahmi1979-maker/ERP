import {z} from "zod";
import {buildAiSearchTextQuery, matchAiSearchLookups,textLiterals, type AiSearchLookup} from "@/lib/dms/ai/search-text";

export const SEARCH_VOCABULARY_VERSION = "erp-search/2.1" as const;
export const subjectSchema = z.strictObject({type: z.enum(["employee", "employee_dependent", "company", "party", "branch", "site"]), id:z.number().int().positive().safe()});
export type SearchSubject = z.infer<typeof subjectSchema>;
export const sharedSearchSchema = z.strictObject({
  query:z.string().trim().max(500), mode:z.enum(["keyword","content","ai","exact","semantic"]).default("keyword"),
  subject:subjectSchema.optional(), page:z.number().int().min(1).max(100000).default(1), pageSize:z.number().int().min(1).max(100).default(25),
  offset:z.number().int().min(0).max(1000000).optional(),nullsFirst:z.boolean().default(false),includeExcerpts:z.boolean().default(false),
  cursor:z.string().max(1000).nullable().default(null),
  filters:z.strictObject({companyId:z.number().int().positive().safe().optional(),branchId:z.number().int().positive().safe().optional(),
    companyIds:z.array(z.number().int().positive().safe()).max(100).optional(),branchIds:z.array(z.number().int().positive().safe()).max(100).optional(),
    documentTypeIds:z.array(z.number().int().positive().safe()).max(100).optional(),status:z.string().regex(/^[a-z_]{1,64}$/).optional(),
    lifecycle:z.enum(["current","all","archived"]).default("current"),issueFrom:z.iso.date().optional(),issueTo:z.iso.date().optional(),
    expiryFrom:z.iso.date().optional(),expiryTo:z.iso.date().optional(),linkedType:z.enum(["employee","employee_dependent","party","vendor"]).optional(),
    candidateIds:z.array(z.number().int().positive().safe()).max(100).optional(),
    metadata:z.array(z.strictObject({field_code:z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),value:z.string().min(1).max(200)})).max(20).optional(),
    categoryId:z.number().int().positive().safe().optional(),confidentiality:z.enum(["internal","company","hr","finance","legal","executive"]).optional(),
    riskLevel:z.enum(["none","low","medium","high","critical"]).optional(),expiryState:z.enum(["expired","expiring_soon","valid","missing_expiry"]).optional(),
  }).default({lifecycle:"current"}),
}).superRefine((v,c)=>{for(const [a,b] of [[v.filters.issueFrom,v.filters.issueTo],[v.filters.expiryFrom,v.filters.expiryTo]])if(a&&b&&a>b)c.addIssue({code:"custom",message:"Invalid date range"});});
export type SharedSearchInput=z.input<typeof sharedSearchSchema>;
export type SharedSearchRequest=z.infer<typeof sharedSearchSchema>;

/** Approved linguistic equivalents only. Configured type IDs remain authoritative. */
const aliases = [
  {pattern:/\b(?:iso(?:\s+(?:9001|14001|45001))?(?:\s+certificat(?:e|es|ion|ions))?)\b/iu, hint:"iso"},
  {pattern:/\bpassports?(?:\s+cop(?:y|ies))?\b|جواز(?:ات)?(?:\s+السفر)?/iu,hint:"passport"},
  {pattern:/\b(?:emirates\s+id|eid)\b|الهوية\s+الإماراتية/iu,hint:"emirates id"},
  {pattern:/\b(?:cicpa)(?:\s+(?:gate\s+)?pass(?:es)?)?\b/iu,hint:"cicpa"},
  {pattern:/\b(?:residen(?:ce|cy)\s+visa)\b|تأشيرة\s+الإقامة/iu,hint:"residence visa"},
];
export function hasDocumentLanguage(query:string):boolean{return aliases.some(a=>a.pattern.test(query));}
const filler=/\b(?:please|show|find|search|for|give|me|the|document|documents|of|employee|employees|dependent|dependents)\b/giu;
export function normalizeIdentity(value:string):string{return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[\u064b-\u065f\u0670\u0640]/g,"").replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/[^\p{L}\p{N}@._/-]+/gu," ").trim().replace(/\s+/g," ");}
export function identityMatches(label:string,code:string|null,query:string):boolean {
  const q=normalizeIdentity(query), name=normalizeIdentity(label);
  return !!q && (normalizeIdentity(code??"")===q || name===q || name.startsWith(q+" "));
}
export function matchesSearchText(text:string,query:string):boolean {
  const canonical=(s:string)=>normalizeIdentity(s).replace(/\b(?:certificates|certification|certifications)\b/g,"certificate");
  const haystack=canonical(text),terms=canonical(query).split(" ").filter(Boolean);
  return terms.every(term=>haystack.includes(term));
}
/** Semantic wording is soft; explicit identifiers/standards remain hard terms. */
export function semanticHardText(text:string):string{return textLiterals(text).filter(term=>/[0-9@]/.test(term)).join(" ");}
export function documentMeaning(query:string,types:AiSearchLookup[]) {
  let remainder=query.trim(), typeIds:number[]=[], typeHint:string|null=null;
  const alias=aliases.find(a=>a.pattern.test(query));
  if(alias){const matched=matchAiSearchLookups(alias.hint,types);if(matched.length){typeIds=matched.map(t=>t.id);typeHint=alias.hint;
    // A standard number remains a hard text constraint even when ISO type resolves.
    const phrase=remainder.match(alias.pattern)?.[0]??""; const standard=phrase.match(/\b(?:9001|14001|45001)\b/)?.[0];
    remainder=remainder.replace(alias.pattern," ")+(standard?` ${standard}`:"");}}
  if(!alias){const configured=types.filter(t=>normalizeIdentity(query).includes(normalizeIdentity(t.name_en))&&normalizeIdentity(t.name_en).length>3)
    .sort((a,b)=>b.name_en.length-a.name_en.length);if(configured.length){const name=configured[0].name_en;typeHint=name;typeIds=matchAiSearchLookups(name,types).map(t=>t.id);remainder=remainder.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"iu")," ");}}
  const expiry=/\bexpired\b|منتهي/iu.test(query)?"expired" as const:/\bexpiring(?:\s+soon)?\b/iu.test(query)?"expiring_soon" as const:null;
  remainder=remainder.replace(/\b(?:expired|expiring|soon)\b|منتهي/giu," ").replace(filler," ").trim().replace(/\s+/g," ");
  return {typeIds,typeHint,remainder,expiry,subjectHint:remainder.replace(/\b(?:9001|14001|45001)\b/g,"").trim(),terms:buildAiSearchTextQuery([remainder])};
}

/** Every caller uses a registered owning reader; registration is not a grant. */
export const SEARCH_ADAPTERS = Object.freeze({
  documents:{permission:"dms.documents.view",owner:"dms",count:"exact_authorized",source:"dms_documents"},
  hr:{permission:"hr.employees.view",owner:"hr",count:"domain_owned",source:"employees"},
  global:{permission:"ai.search.view",owner:"common",count:"exact_authorized",source:"registered_native_reads"},
  navigation:{permission:null,owner:"routes",count:"not_applicable",source:"route_access_registry"},
} as const);
export function assertSearchAdapter(name:string):asserts name is keyof typeof SEARCH_ADAPTERS {if(!Object.hasOwn(SEARCH_ADAPTERS,name))throw Error("Unsupported search capability");}
