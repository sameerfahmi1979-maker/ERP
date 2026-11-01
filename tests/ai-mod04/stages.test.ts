import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runPreparationStage } from "@/lib/dms/preparation/stages";
describe("durable paid-stage boundary", () => {
  it("reuses a completed receipt without a second provider call", async () => {
    const work = vi.fn(); const rpc = vi.fn().mockResolvedValue({ success: true, state: "completed", value: "retained" });
    expect(await runPreparationStage(rpc, "analysis", z.string(), work)).toBe("retained"); expect(work).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("holds an uncertain started stage instead of repeating paid work", async () => {
    const work = vi.fn(); const rpc = vi.fn().mockResolvedValue({ success: true, state: "uncertain", value: null });
    await expect(runPreparationStage(rpc, "analysis", z.string(), work)).rejects.toThrow("unconfirmed"); expect(work).not.toHaveBeenCalled();
  });
  it("persists a verified value before reporting completion", async () => {
    const order: string[] = [];
    const rpc = vi.fn(async (action: string) => { order.push(action); return { success: true, state: action === "begin" ? "started" : "completed", value: action === "begin" ? null : "result" }; });
    expect(await runPreparationStage(rpc, "analysis", z.string(), async () => { order.push("provider"); return "result"; })).toBe("result");
    expect(order).toEqual(["begin", "provider", "complete"]);
  });
  it("does not claim success on a lost publication response", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ success: true, state: "started", value: null }).mockRejectedValueOnce(Error("response lost"));
    await expect(runPreparationStage(rpc, "analysis", z.string(), async () => "result")).rejects.toThrow("response lost");
  });
  it("rejects malformed or unsuccessful stage receipts before provider work", async () => {
    const work = vi.fn();
    await expect(runPreparationStage(vi.fn().mockResolvedValue({ success: false, state: "started", value: null }), "analysis", z.string(), work)).rejects.toThrow();
    expect(work).not.toHaveBeenCalled();
  });
  it("rejects invalid model output without publishing it", async () => {
    const rpc = vi.fn().mockResolvedValue({ success: true, state: "started", value: null });
    await expect(runPreparationStage(rpc, "analysis", z.string(), async () => 9 as unknown as string)).rejects.toThrow(); expect(rpc).toHaveBeenCalledTimes(1);
  });
});
