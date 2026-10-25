import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { diagnosticKind, diagnosticRoute, reportSafeDiagnostic } from "@/lib/observability/safe-diagnostic";
beforeEach(()=>{vi.spyOn(console,"error").mockImplementation(()=>{});vi.spyOn(console,"info").mockImplementation(()=>{});});
afterEach(()=>vi.restoreAllMocks());
it("logs only an allowlisted route template, category, reference and build",()=>{
  const error=Object.assign(new Error("private person password=secret Bearer private"),{digest:"123456"});
  const reference=reportSafeDiagnostic(error,{route:"/dms/documents/record/987?token=private",source:"server",event:"TEST_FAULT",build:"a".repeat(40)});
  expect(reference).toMatch(/^MON-[A-F0-9]{12}$/);
  const payload=JSON.parse(vi.mocked(console.error).mock.calls[0][0]);
  expect(payload).toMatchObject({reference,route:"/dms/documents/record/[id]",kind:"unexpected",build:"a".repeat(40),digest:"123456"});
  expect(JSON.stringify(payload)).not.toMatch(/private|secret|Bearer|987|stack/);
});
it("does not turn every response cancellation into an application fault",()=>{
  const error=new Error("ResponseAborted private request");
  expect(diagnosticKind(error)).toBe("cancelled");
  reportSafeDiagnostic(error,{route:"/unknown/private-name",source:"server"});
  expect(console.info).toHaveBeenCalledOnce();expect(console.error).not.toHaveBeenCalled();
});
it.each([["Cannot read parentNode","dom"],["Hydration mismatch","hydration"],["Timed out","timeout"],["fetch failed","dependency"]])("classifies %s without emitting it",(message,kind)=>expect(diagnosticKind(Error(message))).toBe(kind));
it("never reflects an unknown path or unsafe build/event/digest",()=>{
  expect(diagnosticRoute("https://private.example/token")).toBe("unknown");
  reportSafeDiagnostic({digest:"private-token"},{route:"/unregistered/private-person",source:"client",build:"PRIVATE_BUILD",event:"secret in message"});
  expect(String(vi.mocked(console.error).mock.calls[0][0])).not.toMatch(/private|PRIVATE|secret/);
});
