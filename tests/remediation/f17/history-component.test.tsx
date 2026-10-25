// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor,act} from "@testing-library/react";
import {syntheticAuthContext} from "../../performance/fixtures/auth-context";
vi.mock("@/components/erp/table/erp-data-table",()=>({ERPDataTable:({data,emptyMessage}:{data:{entity_reference:string}[];emptyMessage:string})=><div>{data.length?data.map((r,i)=><p key={i}>{r.entity_reference}</p>):emptyMessage}</div>}));
import {UserSecurityHistorySection} from "@/features/users/user-security-history-section";
const auth=syntheticAuthContext(["audit.view"]);
beforeEach(()=>vi.stubGlobal("fetch",vi.fn()));afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("shows unavailable on failure and clears the error on a successful retry",async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({error:"PRIVATE"},{status:503})).mockResolvedValueOnce(Response.json({logs:[]}));
 render(<UserSecurityHistorySection userProfileId={8} authContext={auth}/>);await screen.findByRole("alert");expect(screen.queryByText(/No matching events/)).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:/Retry/}));await screen.findByText(/No matching events/);expect(screen.queryByRole("alert")).toBeNull();expect(fetch).toHaveBeenCalledTimes(2);
});
it("retires late history on subject/account change and aborts its request",async()=>{
 let release!:(r:Response)=>void;let signal!:AbortSignal;
 vi.mocked(fetch).mockImplementationOnce((_url,init)=>{signal=init!.signal!;return new Promise(r=>{release=r;});}).mockResolvedValueOnce(Response.json({logs:[]}));
 const view=render(<UserSecurityHistorySection userProfileId={8} authContext={auth}/>);
 view.rerender(<UserSecurityHistorySection userProfileId={9} authContext={{...auth,profile:{...auth.profile!,id:22}}}/>);
 expect(signal.aborted).toBe(true);await act(async()=>release(Response.json({logs:[{id:1,action:"USER_CREATED",entity_reference:"Old account private data"}]})));
 await waitFor(()=>expect(screen.queryByText("Old account private data")).toBeNull());await screen.findByText(/No matching events/);
});
