import { beforeEach, expect, it, vi } from "vitest";
import { checkDuplicateIban } from "@/server/actions/master-data/parties";

const mock = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn(), auth: vi.fn(), global: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.createClient }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: mock.auth, hasGlobalPermission: mock.global }));

const canonical = "AE070331234567890123456";
const legacy = " ae07\t0331 2345 6789\n0123456 ";
const match = { party_code: "SYNTHETIC", display_name: "Synthetic historical match" };

beforeEach(() => {
  vi.resetAllMocks();
  // This legacy row is unknown to the current operator and differs from the entered format.
  const checkExact = (candidate: string) => Promise.resolve({
    data: candidate === legacy ? [{ parties: match }] : [], error: null,
  });
  mock.createClient.mockResolvedValue({
    from: () => ({ select: () => ({ eq: () => ({
      eq: checkExact,
      in: (column: string, candidates: string[]) => checkExact(column === "iban" && candidates.includes(legacy) ? legacy : ""),
    }) }) }),
    rpc: mock.rpc,
  });
  mock.auth.mockResolvedValue({});
  mock.global.mockReturnValue(true);
});

it("checks one normalized candidate and returns only permitted party labels", async () => {
  mock.rpc.mockResolvedValue({ data: [match], error: null });

  expect(await checkDuplicateIban(canonical)).toEqual({
    success: true, data: { isDuplicate: true, existingParties: [match] },
  });
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("perf_party_iban_advisory", {
    p_iban: canonical, p_exclude_bank_detail: null,
  });
});

it("gates the sensitive lookup with current global bank management access", async () => {
  mock.global.mockReturnValue(false);

  expect(await checkDuplicateIban(canonical)).toMatchObject({ success: false });
  expect(mock.global).toHaveBeenCalledWith({}, "master_data.parties.manage_bank_details");
  expect(mock.createClient).not.toHaveBeenCalled();
});

it("does no database work for partial, invalid-check-digit, or non-ASCII inputs", async () => {
  expect(await checkDuplicateIban("AE070331")).toMatchObject({ success: false });
  expect(await checkDuplicateIban("AE080331234567890123456")).toMatchObject({ success: false });
  expect(await checkDuplicateIban("GB82WEſT12345698765432")).toMatchObject({ success: false });
  expect(mock.auth).not.toHaveBeenCalled();
  expect(mock.createClient).not.toHaveBeenCalled();
});
