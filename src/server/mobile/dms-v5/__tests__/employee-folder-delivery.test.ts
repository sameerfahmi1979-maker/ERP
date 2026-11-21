import {beforeEach,describe,expect,it,vi} from "vitest";
import {POST} from "@/app/api/mobile/dms/v1/route";

const f=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:f.rpc})}));
vi.mock("@/lib/rbac/check",async load=>({...await load<typeof import("@/lib/rbac/check")>(),
  getAuthContext:f.auth,canUseApplication:()=>true,hasPermission:()=>false}));

function folder(){
  return POST(new Request("https://erp.invalid/api/mobile/dms/v1",{
    method:"POST",headers:{Authorization:"Bearer test.a.b","Content-Type":"application/json"},
    body:JSON.stringify({op:"folder",employeeRecord:true,entityType:"employee",entityId:17,page:1}),
  }));
}
function gate(){
  let release!:()=>void;
  const wait=new Promise<void>(resolve=>{release=resolve;});
  return {wait,release};
}
const principal={profile:{id:7,auth_user_id:"user-A"}};
const privateRow={id:8,title:"Private medical assessment",number:"CONF-83"};
const otherRow={id:9,title:"Induction",number:"IND-9"};
beforeEach(()=>vi.resetAllMocks());

describe("selected employee folder delivery",()=>{
  it.each(["link","document","medical","retained"] as const)("uses current row and count when %s access changes during final principal verification",async change=>{
    const allowed={link:true,document:true,medical:true};
    const entered=gate(),finish=gate();
    f.auth.mockResolvedValueOnce(principal).mockImplementationOnce(async()=>{
      entered.release();await finish.wait;return principal;
    });
    f.rpc.mockImplementation(async(name,args)=>{
      expect(name).toBe("mobile_dms_document");
      expect(args).toEqual({p_action:"employee_folder",p_data:{employeeId:17,page:1}});
      const rows=Object.values(allowed).every(Boolean)?[privateRow,otherRow]:[otherRow];
      return {data:{employeeId:17,rows,totalCount:rows.length},error:null};
    });
    const pending=folder();
    await entered.wait;
    if(change!=="retained")allowed[change]=false;
    finish.release();
    const response=await pending;
    expect(response.status).toBe(200);
    const result=await response.json(),rows=change==="retained"?[privateRow,otherRow]:[otherRow];
    expect(result.data).toMatchObject({employeeId:17,rows,totalCount:rows.length,page:1,pageSize:25,hasMore:false});
    if(change!=="retained"){
      expect(JSON.stringify(result)).not.toContain(privateRow.title);
      expect(JSON.stringify(result)).not.toContain(privateRow.number);
    }
    expect(f.auth).toHaveBeenCalledTimes(2);
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("refuses a replaced principal at the final check",async()=>{
    f.auth.mockResolvedValueOnce(principal).mockResolvedValueOnce({profile:{id:8,auth_user_id:"user-B"}});
    f.rpc.mockResolvedValue({data:{employeeId:17,rows:[privateRow],totalCount:1},error:null});
    const response=await folder();
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(privateRow.title);
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
