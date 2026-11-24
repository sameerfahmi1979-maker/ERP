import { describe, expect, it, vi } from "vitest";
import { processNotificationTick } from "../notification-scheduler";

const time = 1_800_000_000_000;
const input = {
  runId: "4c51b84a-85be-44f9-9211-fe959137c8b2",
  ticket: "16005ff0-be16-4ba6-8ae6-b49ae09d67b0",
  readyAtMs: time,
};
const now = () => time;

describe("finite notification scheduler", () => {
  it("avoids the first database call for disabled, invalid or expired requests", async () => {
    const rpc = vi.fn();
    expect(await processNotificationTick(input, {enabled: false, rpc})).toEqual({state: "disabled"});
    expect(await processNotificationTick({}, {enabled: true, rpc})).toEqual({state: "invalid"});
    for (const offset of [-50_000, 21_000]) {
      expect(await processNotificationTick({...input, readyAtMs: time + offset}, {enabled: true, rpc, now})).toEqual({state: "stale"});
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("skips work and successors for an unrecognized or replayed ticket", async () => {
    const rpc = vi.fn().mockResolvedValue(null);
    const dispatch = vi.fn();
    expect(await processNotificationTick(input, {enabled: true, rpc, dispatch, now})).toEqual({state: "inactive"});
    expect(rpc.mock.calls).toEqual([["admit", input]]);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("runs one funded wait and up to eight claims, then hands off once", async () => {
    let clock = time - 500;
    const wait = vi.fn(async (ms: number) => {clock += ms;});
    const rpc = vi.fn().mockResolvedValueOnce({pushEnabled: true, workUntilMs: time + 45_000}).mockResolvedValueOnce(true);
    const dispatch = vi.fn().mockResolvedValue({state: "idle"});
    expect(await processNotificationTick(input, {enabled: true, rpc, dispatch, wait, now: () => clock})).toEqual({state: "queued"});
    expect(wait.mock.calls).toEqual([[500]]);
    expect(dispatch).toHaveBeenCalledTimes(8);
    expect(dispatch).toHaveBeenCalledWith({hardEnd: time + 45_000});
    expect(rpc.mock.calls).toEqual([["admit", input], ["finish", input]]);
  });
  it("retires on insufficient completion time or failed work without chaining", async () => {
    const dispatch = vi.fn().mockRejectedValue(Error("failed"));
    for (const remaining of [1000, 25_000]) {
      const rpc = vi.fn().mockResolvedValueOnce({pushEnabled: true, workUntilMs: time + remaining});
      const reply = await processNotificationTick(input, {enabled: true, rpc, dispatch, now});
      expect(reply.state).toBe(remaining === 1000 ? "stopped" : "unconfirmed");
      expect(rpc.mock.calls).toEqual(remaining === 1000 ? [["admit", input]] : [["admit", input], ["stop", input]]);
    }
    expect(dispatch).toHaveBeenCalledTimes(8);
  });
  it("honors a capture-only run and cannot restart itself after terminal retirement", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({pushEnabled: false, workUntilMs: time + 30_000}).mockResolvedValueOnce(false);
    const dispatch = vi.fn();
    expect(await processNotificationTick(input, {enabled: true, rpc, dispatch, now})).toEqual({state: "stopped"});
    expect(dispatch).not.toHaveBeenCalled();
  });
});
