// @vitest-environment jsdom
import React from "react";
import "../remediation/f05/setup";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,render,waitFor,fireEvent,screen} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {FluentProvider,webLightTheme} from "@fluentui/react-components";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import {DmsSectionActivity} from "@/features/dms/documents/section-activity";
const serverReads=vi.hoisted(()=>({create:vi.fn(()=>{throw Error("No server actions in client read tests");})}));
vi.mock("@/hooks/use-workspace",()=>({useWorkspace:()=>({openTab:vi.fn()})}));
vi.mock("next/cache",()=>({revalidatePath:()=>{throw Error("No mutations");}}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn(),push:vi.fn()})}));
vi.mock("@/lib/supabase/server",()=>({createClient:serverReads.create}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>{throw Error("No privileged client");}}));
import {DmsDocumentAiSection} from "@/features/dms/documents/sections/dms-document-ai-section";
import {DmsDocumentAiSummarySection} from "@/features/dms/documents/sections/dms-document-ai-summary-section";
import {DmsDocumentAuditSection} from "@/features/dms/documents/sections/dms-document-audit-section";
import {DmsDocumentCommentsSection} from "@/features/dms/documents/sections/dms-document-comments-section";
import {DmsDocumentContentSection} from "@/features/dms/documents/sections/dms-document-content-section";
import {DmsDocumentFilesSection} from "@/features/dms/documents/sections/dms-document-files-section";
import {DmsDocumentIntelligenceSection} from "@/features/dms/documents/sections/dms-document-intelligence-section";
import {DmsDocumentLinksSection} from "@/features/dms/documents/sections/dms-document-links-section";
import {DmsDocumentMetadataSection} from "@/features/dms/documents/sections/dms-document-metadata-section";
import {DmsDocumentOcrSection} from "@/features/dms/documents/sections/dms-document-ocr-section";
import {DmsDocumentSemanticSection} from "@/features/dms/documents/sections/dms-document-semantic-section";
import {DmsDocumentTagsSection} from "@/features/dms/documents/sections/dms-document-tags-section";
import {DmsDocumentUnderstandingSection} from "@/features/dms/documents/sections/dms-document-understanding-section";
import {DmsDocumentVersionsSection} from "@/features/dms/documents/sections/dms-document-versions-section";
import {ErpMappingPreviewPanel} from "@/features/dms/documents/sections/dms-erp-mapping-preview-panel";
import {DmsLinkVersionDialog} from "@/features/dms/documents/sections/dms-link-version-dialog";
import {DmsApprovalActionPanel} from "@/features/dms/approvals/dms-approval-action-panel";
import {DmsDocumentExpirySection} from "@/features/dms/documents/sections/dms-document-expiry-section";
const cases=[
 ["expiry",<DmsDocumentExpirySection documentId={9} documentNo="SYN-9" documentTitle="Synthetic" issueDate={null} expiryDate="2026-12-01" requiresExpiryTracking/>],
 ["ai",<DmsDocumentAiSection documentId={9}/>],
 ["ai-summary",<DmsDocumentAiSummarySection documentId={9}/>],
 ["audit",<DmsDocumentAuditSection documentId={9}/>],
 ["comments",<DmsDocumentCommentsSection documentId={9}/>],
 ["content",<DmsDocumentContentSection documentId={9}/>],
 ["files",<DmsDocumentFilesSection documentId={9}/>],
 ["intelligence",<DmsDocumentIntelligenceSection documentId={9}/>],
 ["links",<DmsDocumentLinksSection documentId={9} isViewing/>],
 ["metadata",<DmsDocumentMetadataSection documentId={9} documentTypeId={2} isViewing={false}/>],
 ["ocr",<DmsDocumentOcrSection documentId={9}/>],
 ["semantic",<DmsDocumentSemanticSection documentId={9}/>],
 ["tags",<DmsDocumentTagsSection documentId={9} isViewing/>],
 ["understanding",<DmsDocumentUnderstandingSection documentId={9}/>],
 ["versions",<DmsDocumentVersionsSection documentId={9}/>],
 ["mapping",<ErpMappingPreviewPanel documentId={9}/>],
 ["version picker",<DmsLinkVersionDialog documentId={9} documentNo="SYN-9" open onOpenChange={()=>{}}/>],
 ["approval",<DmsApprovalActionPanel documentId={9}/>]
] as const;
let client:QueryClient;const calls:{kind:string;args:unknown[]}[]=[];
beforeEach(()=>{client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});calls.length=0;serverReads.create.mockClear();vi.stubGlobal("fetch",vi.fn(async (_url,init)=>{expect(init.signal).toBeInstanceOf(AbortSignal);expect(init.cache).toBe("no-store");calls.push(JSON.parse(init.body));return new Response(JSON.stringify({success:false,error:"Permission denied"}),{status:403});}));});
afterEach(()=>{cleanup();client.clear();vi.unstubAllGlobals();});
function wrap(element:React.ReactNode,active=true){return <FluentProvider theme={webLightTheme}><QueryClientProvider client={client}><WorkspaceUiMemoryProvider><DmsSectionActivity value={active}>{element}</DmsSectionActivity></WorkspaceUiMemoryProvider></QueryClientProvider></FluentProvider>;}
for(const [name,element] of cases){
 it(name+" executes its actual read consumer and shows a safe denied state",async()=>{render(wrap(element));if(name==="mapping")fireEvent.click(screen.getByRole("button",{name:"ERP Mapping Preview"}));await waitFor(()=>{expect(calls.length).toBeGreaterThan(0);expect(document.body.textContent).toMatch(/could not|unavailable|access|restricted/i);});expect(calls.every(c=>c.kind&&Array.isArray(c.args))).toBe(true);expect(document.body.textContent).not.toContain("private backend");});
 it(name+" does not start reads while its retained section is inactive",async()=>{render(wrap(element,false));await new Promise(r=>setTimeout(r,20));expect(calls).toHaveLength(0);expect(serverReads.create).not.toHaveBeenCalled();});
}
it("metadata editor hides its portal on a denied recheck and restores the retained draft after retry",async()=>{
 let denied=false;
 vi.stubGlobal("fetch",vi.fn(async (_url,init)=>{
  if(denied)return Response.json({success:false,error:"Denied"},{status:403});
  const {kind}=JSON.parse(init.body);
  return Response.json({success:true,data:kind==="getMetadataDefinitionsForType"?[{id:1,field_label_en:"Reference",field_type:"text",is_required:true}]:[]});
 }));
 render(wrap(<DmsDocumentMetadataSection documentId={9} documentTypeId={2} isViewing={false}/>));
 fireEvent.click(await screen.findByRole("button",{name:"Edit metadata"}));
 fireEvent.change(screen.getByLabelText("Reference",{selector:"input"}),{target:{value:"Synthetic retained draft"}});
 denied=true;await act(async()=>{await client.invalidateQueries();});
 await screen.findByRole("alert");expect(screen.queryByRole("dialog")).toBeNull();
 denied=false;fireEvent.click(screen.getByRole("button",{name:/Retry/}));
 await screen.findByRole("dialog");expect((screen.getByLabelText("Reference",{selector:"input"}) as HTMLInputElement).value).toBe("Synthetic retained draft");
});
