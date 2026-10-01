import {expect,it} from "vitest";
import {queueStatusLabel,queueControls} from "@/lib/email/queue/presentation";
const q={status:"pending",lastError:null,attemptCount:0,maxAttempts:3};
it("provider acceptance never claims inbox delivery",()=>expect(queueStatusLabel({...q,status:"sent",deliveryState:"provider_accepted"})).toBe("Provider accepted"));
it("legacy sent evidence is not upgraded",()=>expect(queueStatusLabel({...q,status:"sent"})).toBe("Legacy sent (unverified)"));
it.each(["delivery_unknown","failed","cancelled"])("terminal %s cannot send or retry",status=>expect(queueControls({...q,status})).toEqual({process:false,retry:false,cancel:false}));
it("paused and exhausted items cannot be processed",()=>{expect(queueControls({...q,pausedAt:"now"}).process).toBe(false);expect(queueControls({...q,attemptCount:3}).process).toBe(false);});
it("dispatched mail cannot be cancelled",()=>expect(queueControls({...q,status:"processing",dispatchStartedAt:"now"}).cancel).toBe(false));
it("quota wait and retry remain distinct",()=>{expect(queueStatusLabel({...q,lastError:"F09:provider_quota"})).toContain("capacity");expect(queueControls({...q,lastError:"F09:provider_quota"}).retry).toBe(false);expect(queueControls({...q,lastError:"F09:retry"}).retry).toBe(true);});
it("confirmed retry can be cancelled without pretending to undo a dispatched send",()=>{
 expect(queueControls({status:"pending",lastError:"F09:retry",dispatchStartedAt:"2026-09-30T00:00:00Z",deliveryState:null,attemptCount:1,maxAttempts:3}).cancel).toBe(true);
});
