import { generateKeyPairSync } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { classifyFcm,dispatchOnePush,fcmMessage,pushConfigured } from "../notifications-provider";

const A="214806d3-94fb-4f66-b529-923eb584bc5e",B="13488f6e-8ea0-49e3-9806-68d444e11832";
const job={jobId:A,lease:B,profileId:"5",sessionId:A,control:false};
const row={token:"opaque".repeat(12),eventId:A,accountId:B,category:"erp" as const,sound:false,vibrate:true};
const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const env={ERP_COMM_PUSH_ENABLED:"true",ERP_FCM_PROJECT_ID:"demo-fixture",ERP_FCM_CLIENT_EMAIL:"sender@demo-fixture.iam.gserviceaccount.com",
  ERP_FCM_PRIVATE_KEY:privateKey.export({format:"pem",type:"pkcs8"}).toString()};
const permit={ok:true as const,permitId:B,newReservation:true,expiresAt:new Date(Date.now()+60000)};
describe("communication push dispatch",()=>{
  it("holds without credentials or explicit feature gate",async()=>{
    const rpc=vi.fn(),fetcher=vi.fn();
    expect(pushConfigured({})).toBe(false);
    expect(await dispatchOnePush({env:{...env,ERP_COMM_PUSH_ENABLED:"false"},rpc,fetcher})).toEqual({state:"held"});
    expect(rpc).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
  });
  it("reserves against the recipient's exact session and lease before provider calls",async()=>{
    const rpc=vi.fn(async(op:string)=>op==="claim"?job:true);
    const reserve=vi.fn().mockResolvedValue({ok:false,status:503,reason:"held"});
    const fetcher=vi.fn();
    expect(await dispatchOnePush({env,rpc,reserve,fetcher})).toEqual({state:"held"});
    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({actorId:"5",operationId:B,binding:{actorSessionId:A,command:{op:"notifications.deliver",args:{jobId:A,lease:B}}}}));
    expect(fetcher).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith("finish",{jobId:A,lease:B,outcome:"held"});
  });
  it("suppresses a revoked recipient before OAuth or FCM",async()=>{
    const rpc=vi.fn(async(op:string)=>op==="claim"?job:op==="prepare"?null:true);
    const fetcher=vi.fn();expect(await dispatchOnePush({env,rpc,reserve:vi.fn().mockResolvedValue(permit),fetcher})).toEqual({state:"suppressed"});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends an ID-only sensitive event to the pinned HTTP v1 project and records provider acceptance",async()=>{
    const rpc=vi.fn(async(op:string)=>op==="claim"?job:(op==="prepare"||op==="confirm")?{...row,label:"Protected HR data"}:true);
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({access_token:"synthetic-access",token_type:"Bearer"}))
      .mockResolvedValueOnce(Response.json({name:"projects/demo-fixture/messages/1"}));
    expect(await dispatchOnePush({env,rpc,reserve:vi.fn().mockResolvedValue(permit),fetcher})).toEqual({state:"accepted"});
    expect(fetcher.mock.calls[1][0]).toBe("https://fcm.googleapis.com/v1/projects/demo-fixture/messages:send");
    expect(JSON.parse(fetcher.mock.calls[1][1].body).message.data).toEqual({eventId:A,accountId:B,category:"erp",sound:"false",vibrate:"true"});
    expect(()=>fcmMessage({...row,...{body:"private"}})).toThrow();
  });
  it("delivers a previously funded cancellation through the separately enabled control transport",async()=>{
    const reserve=vi.fn().mockRejectedValue(new Error("Ordinary admissions paused"));
    const rpc=vi.fn(async(op:string)=>op==="claim"?{...job,control:true}:["prepare","confirm"].includes(op)?{...row,category:"sos"}:true);
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({access_token:"synthetic-access",token_type:"Bearer"}))
      .mockResolvedValueOnce(Response.json({name:"projects/demo-fixture/messages/cancel"}));
    expect(await dispatchOnePush({env:{...env,ERP_COMM_PUSH_ENABLED:"false",ERP_COMM_CONTROL_PUSH_ENABLED:"true"},rpc,reserve,fetcher})).toEqual({state:"accepted"});
    expect(reserve).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("claim",{ordinary:false,control:true});
    expect(rpc).toHaveBeenCalledWith("confirm",{jobId:A,lease:B});
    expect(JSON.parse(fetcher.mock.calls[1][1].body).message.data).toMatchObject({eventId:A,accountId:B,category:"sos"});
  });
  it("holds the transport when the protected origin or monitor pool has no remaining attempts",async()=>{
    const rpc=vi.fn(async(op:string)=>{if(op==="claim")return {...job,control:true};if(op==="prepare")throw Error("Funding unavailable");return true;});
    const fetcher=vi.fn(),reserve=vi.fn();
    await expect(dispatchOnePush({env:{...env,ERP_COMM_CONTROL_PUSH_ENABLED:"true"},rpc,reserve,fetcher})).rejects.toThrow("Funding unavailable");
    expect(fetcher).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("finish",{jobId:A,lease:B,outcome:"held"});
  });
  it("distinguishes invalid installations, quota pressure, ambiguous acceptance and invalid configuration",async()=>{
    expect(await classifyFcm(Response.json({error:{details:[{"@type":"type.googleapis.com/google.firebase.fcm.v1.FcmError",errorCode:"UNREGISTERED"}]}},{status:404}))).toBe("invalidToken");
    expect(await classifyFcm(Response.json({},{status:429}))).toBe("retry");
    expect(await classifyFcm(Response.json({}))).toBe("retry");
    expect(await classifyFcm(Response.json({},{status:403}))).toBe("held");
  });
});
