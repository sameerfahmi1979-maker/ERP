import {afterEach, expect, it, vi} from "vitest";
import {pageParameters,validReadPage} from "@/lib/reads/page-contract";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {readJson} from "@/lib/reads/client";
afterEach(() => vi.unstubAllGlobals());
it("rejects mismatched pages, unsafe sizes and impossible counts", () => {
  const page={rows:[{id:1}],totalCount:1,page:1,pageSize:25};
  expect(validReadPage(page,{})).toBe(true);
  expect(validReadPage(page,{page:2})).toBe(false);
  for(const update of [{pageSize:101},{totalCount:0},{page:0},{totalCount:null},{rows:null}])expect(validReadPage({...page,...update},{})).toBe(false);
});
it("uses bounded explicit pagination and rejects invented fields", () => {
  expect(pageParameters.parse({})).toEqual({page:1,pageSize:25,search:""});
  for (const params of [{page:0},{pageSize:101},{pageSize:0},{page:1.5},{sort:"secret"},{search:"x".repeat(201)}]) expect(pageParameters.safeParse(params).success).toBe(false);
});
it("fails honestly beyond lookup cap, excessive page, changed count and duplicate identity", async () => {
  await expect(collectCompletePages(async () => ({data:[],count:5001,error:null}),{maxRows:5000})).rejects.toThrow("Too many");
  await expect(collectCompletePages(async () => ({data:[1,2],count:2,error:null}),{batchSize:1})).rejects.toThrow("Invalid");
  await expect(collectCompletePages(async from => ({data:[{id:1}],count:from ? 3 : 2,error:null}),{batchSize:1})).rejects.toThrow("changed");
  await expect(collectCompletePages(async () => ({data:[{id:1}],count:2,error:null}),{batchSize:1,identity:r=>r.id})).rejects.toThrow("changed");
});
it("never exposes an untrusted successful-HTTP error body", async () => {
  vi.stubGlobal("fetch",async()=>Response.json({success:false,error:"private database detail"}));
  await expect(readJson("example",{})).rejects.toThrow("Records could not be loaded. Please retry.");
});
it("malformed JSON and thrown network diagnostics never escape to consumers", async () => {
  vi.stubGlobal("fetch",async()=>new Response("private upstream diagnostic",{status:200}));
  await expect(readJson("example",{})).rejects.toThrow("Records could not be loaded. Please retry.");
  vi.stubGlobal("fetch",async()=>{throw Error("private network detail");});
  await expect(readJson("example",{})).rejects.toThrow("Records could not be loaded. Please retry.");
});
