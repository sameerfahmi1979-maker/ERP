// @vitest-environment jsdom
import "../remediation/f05/setup";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import type {AuthContext} from "@/lib/rbac/check";
const state=vi.hoisted(()=>({refresh:vi.fn(),event:undefined as (()=>void)|undefined}));
vi.mock("@/hooks/use-workspace",()=>({useWorkspace:()=>({openTab:vi.fn()})}));
vi.mock("@/hooks/use-workspace-table-state",()=>({useWorkspaceTableState:()=>({search:"",setSearch:vi.fn(),filters:{},setFilters:vi.fn(),pagination:{pageIndex:0,pageSize:25},setPagination:vi.fn()})}));
vi.mock("@/hooks/realtime/use-realtime-sync",()=>({useRealtimeSync:({onEvent}:{onEvent:()=>void})=>{state.event=onEvent;}}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:state.refresh})}));
vi.mock("@/features/hr/employees/document-create/hr-document-employee-create-wizard",()=>({HrDocumentEmployeeCreateWizard:()=>null}));
vi.mock("@/server/actions/hr/employees",()=>({archiveEmployee:vi.fn()}));
vi.mock("@/server/actions/dms/documents",()=>({archiveDmsDocument:vi.fn(),unarchiveDmsDocument:vi.fn(),deleteDmsDocument:vi.fn()}));
vi.mock("@/server/actions/dms/ai-search",()=>({aiSearchDmsDocuments:vi.fn()}));
vi.mock("@/server/actions/dms/semantic-search",()=>({semanticSearchDmsDocuments:vi.fn()}));
import {EmployeesTable} from "@/features/hr/employees/employees-table";
import {DmsDocumentsTable} from "@/features/dms/documents/dms-documents-table";
const auth={profile:{id:1,must_change_password:false},isAccountActive:true,roleCodes:[],roleAssignments:[],permissionCodes:[],globalPermissionCodes:[]} as unknown as AuthContext;
let client:QueryClient;
const fetcher=vi.fn();
function show(child:React.ReactNode){return render(<QueryClientProvider client={client}><WorkspaceUiMemoryProvider>{child}</WorkspaceUiMemoryProvider></QueryClientProvider>);}
beforeEach(()=>{client=new QueryClient({defaultOptions:{queries:{retry:false}}});state.refresh.mockClear();fetcher.mockReset();fetcher.mockImplementation(async()=>Response.json({success:true,data:[]}));vi.stubGlobal("fetch",fetcher);});
afterEach(()=>{cleanup();client.clear();vi.unstubAllGlobals();});
it("actual employee component reuses SSR and independently starts lean choices without initial employee refetch",async()=>{
 show(<EmployeesTable initialRows={[]} initialTotal={0} initialUpdatedAt={Date.now()} authContext={auth}/>);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 const urls=fetcher.mock.calls.map(c=>String(c[0]));expect(urls.every(url=>url.includes("employee-filter-"))).toBe(true);
 expect(screen.getByRole("region",{name:"Scrollable employees"}).getAttribute("aria-busy")).toBe("false");
 expect(screen.queryByRole("alert")).toBeNull();
});
it("employee choice denial remains an error with retry, not an empty successful filter",async()=>{
 fetcher.mockResolvedValue(Response.json({success:false,error:"Permission denied"},{status:403}));
 show(<EmployeesTable initialRows={[]} initialTotal={0} initialUpdatedAt={Date.now()} authContext={auth}/>);
 await waitFor(()=>expect(screen.getByRole("alert")).toBeTruthy());expect(screen.getByRole("button",{name:"Retry loading"})).toBeTruthy();
});
it("actual DMS component reuses SSR, refreshes just the read and never full-route refreshes",async()=>{
 fetcher.mockResolvedValue(Response.json({success:true,data:{rows:[],totalCount:0,page:1,pageSize:25}}));
 show(<DmsDocumentsTable initialDocuments={[]} initialTotal={0} initialUpdatedAt={Date.now()} categories={[]} documentTypes={[]}/>);
 expect(fetcher).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Refresh documents"}));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());expect(state.refresh).not.toHaveBeenCalled();
 await waitFor(()=>expect(screen.getByRole("region",{name:"Scrollable documents"}).getAttribute("aria-busy")).toBe("false"));
});
it("DMS criteria change fetches server results with current search and the bounded page",async()=>{
 fetcher.mockResolvedValue(Response.json({success:true,data:{rows:[],totalCount:0,page:1,pageSize:25}}));
 show(<DmsDocumentsTable initialDocuments={[]} initialTotal={0} initialUpdatedAt={Date.now()} categories={[]} documentTypes={[]}/>);
 fireEvent.change(screen.getByRole("textbox",{name:"Search documents"}),{target:{value:"مستند"}});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());
 const params=JSON.parse(fetcher.mock.calls[0][1].body);expect(params.pageSize).toBe(25);expect(params.filters.search).toBe("مستند");
});
