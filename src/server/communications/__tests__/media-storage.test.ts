import { afterEach,expect,it,vi } from "vitest";
import { boundedChatStorage } from "../media-storage";

afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});

it("cancels a real Storage SDK transfer through the scoped service fetch transport",async()=>{
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://isolated-erp.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","synthetic-service-key");
  const controller=new AbortController();
  let requestStarted!:()=>void;
  const started=new Promise<void>(resolve=>{requestStarted=resolve;});
  const transport=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const req=new Request(input,init);
    expect(new URL(req.url).pathname).toBe("/storage/v1/object/erp-chat-media/4f72799f-f838-4033-a3cc-95f55d8619f9");
    expect(req.method).toBe("POST");
    expect(req.headers.get("x-upsert")).toBe("false");
    requestStarted();
    return new Promise<Response>((_,reject)=>req.signal.addEventListener("abort",()=>reject(req.signal.reason),{once:true}));
  });
  vi.stubGlobal("fetch",transport);
  const transfer=boundedChatStorage(controller.signal).from("erp-chat-media").upload("4f72799f-f838-4033-a3cc-95f55d8619f9",new Uint8Array([1,2]),{upsert:false});
  await started;controller.abort();
  const result=await transfer;
  expect(result.error).toBeTruthy();
  expect(result.data).toBeNull();
  expect(transport).toHaveBeenCalledTimes(1);
});
