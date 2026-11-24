import {expect,it} from "vitest";
import {POST} from "@/app/api/internal/process-communication-push/route";
it("retires only the communications shared-secret receiver without authentication or business work",async()=>{
 const result=await POST(new Request("https://erp.algt.net/api/internal/process-communication-push",{method:"POST"}));
 expect(result.status).toBe(410);expect(await result.text()).toBe("");
});
