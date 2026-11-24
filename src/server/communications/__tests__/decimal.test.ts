import { describe, expect, it } from "vitest";
import { chatOperations, decimal } from "../contracts";

describe("communications decimal wire identifiers", () => {
  it.each(["not-a-number", "123e4567-e89b-42d3-a456-426614174000", "1e3", "+1", "-1", "01", " 1", "9223372036854775808"])
    ("rejects malformed or out-of-range %s without throwing outside validation", value => {
      expect(() => decimal.safeParse(value)).not.toThrow();
      expect(decimal.safeParse(value).success).toBe(false);
    });
  it("retains the complete nonnegative signed-bigint wire range", () => {
    for (const value of ["0", "1", "9007199254740993", "9223372036854775807"])
      expect(decimal.parse(value)).toBe(value);
  });
  it("rejects a UUID in a profile selector while preserving a valid mutation identity", () => {
    const input = { peerProfileId: "123e4567-e89b-42d3-a456-426614174000", clientMutationId: "d8148641-55af-46e2-886a-3bd82768740f" };
    expect(() => chatOperations["chat.direct"].safeParse(input)).not.toThrow();
    expect(chatOperations["chat.direct"].safeParse(input).success).toBe(false);
  });
});
