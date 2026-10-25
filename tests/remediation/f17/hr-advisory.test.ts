import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),access:vi.fn(),enabled:vi.fn(),facts:vi.fn(),provider:vi.fn(),log:vi.fn()}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:m.auth,hasPermission:(c:{permissionCodes:string[]},p:string)=>c.permissionCodes.includes(p)}));
vi.mock("@/lib/rbac/employee-access",()=>({getEmployeeAccess:m.access}));
vi.mock("@/lib/hr/ai/feature-flags",()=>({isHrAiMasterEnabled:m.enabled,isHrAiFeatureEnabled:m.enabled}));
vi.mock("@/server/reads/hr-ai-fill-facts",()=>({readHrFillFacts:m.facts}));
vi.mock("@/lib/ai/common/provider-bridge",()=>({callCommonAiStructuredCompletion:m.provider}));
vi.mock("@/lib/hr/ai/usage-log",()=>({logHrAiUsage:m.log}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({})}));
import { generateEmployeeDocumentFillSuggestions } from "@/server/actions/hr/ai/employee-ai-fill";
const ctx={profile:{id:1},permissionCodes:["hr.ai.use","dms.documents.view"],roleAssignments:[]};
const facts={emp:{id:8,full_name_en:"Synthetic person",employee_code:"SYN-8"},identityDocs:[],dmsLinks:[{id:1,document:{id:91,document_type:{name_en:"Synthetic document"}}}],fingerprint:"version-one"};
const suggestion={fieldName:"full_name_en",fieldLabel:"Name",currentValue:null,suggestedValue:"Synthetic person",confidence:.7,sourceDocumentId:91,sourceDocumentName:"Synthetic document",reason:"Review metadata",isConflict:false,requiresReview:false};
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue(ctx);m.access.mockResolvedValue({scopedContext:ctx});m.enabled.mockResolvedValue(true);m.facts.mockResolvedValue(facts);m.provider.mockResolvedValue({success:true,rawJson:JSON.stringify({suggestions:[suggestion],documentsReviewed:999})});});
afterEach(()=>vi.restoreAllMocks());
it("makes the metadata-only scope and human review explicit",async()=>{
 const result=await generateEmployeeDocumentFillSuggestions(8);expect(result.success).toBe(true);if(!result.success)throw Error(result.error);
 expect(result.data.documentsReviewed).toBe(0);expect(result.data.warning).toContain("file contents were not reviewed");expect(result.data.suggestions[0].requiresReview).toBe(true);
 expect(m.provider.mock.calls[0][1]).not.toContain("No AI summary");expect(m.facts).toHaveBeenCalledTimes(2);
});
it.each([{fieldName:"bank_account"},{sourceDocumentId:999},{sourceDocumentId:null}])("rejects unsupported output %j",override=>{
 m.provider.mockResolvedValue({success:true,rawJson:JSON.stringify({suggestions:[{...suggestion,...override}],documentsReviewed:1})});
 return expect(generateEmployeeDocumentFillSuggestions(8)).resolves.toMatchObject({success:false});
});
it("does not call a provider when complete facts are unavailable",async()=>{m.facts.mockRejectedValue(Error("PRIVATE_SOURCE"));const result=await generateEmployeeDocumentFillSuggestions(8);expect(result.success).toBe(false);expect(JSON.stringify(result)).not.toContain("PRIVATE_SOURCE");expect(m.provider).not.toHaveBeenCalled();});
it("holds output when facts change during generation",async()=>{m.facts.mockResolvedValueOnce(facts).mockResolvedValueOnce({...facts,fingerprint:"version-two"});expect((await generateEmployeeDocumentFillSuggestions(8)).success).toBe(false);});
it("holds output after account or permission changes",async()=>{m.access.mockResolvedValueOnce({scopedContext:ctx}).mockResolvedValueOnce({scopedContext:ctx}).mockResolvedValue({scopedContext:{...ctx,profile:{id:2}}});expect((await generateEmployeeDocumentFillSuggestions(8)).success).toBe(false);});
it("disabled features never send data",async()=>{m.enabled.mockResolvedValue(false);expect((await generateEmployeeDocumentFillSuggestions(8)).success).toBe(false);expect(m.facts).not.toHaveBeenCalled();expect(m.provider).not.toHaveBeenCalled();});
