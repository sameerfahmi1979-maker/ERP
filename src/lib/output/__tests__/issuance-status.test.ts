import { describe, expect, it } from "vitest";
import {
  deriveIssuanceDisplayStatus,
  groupForClass,
} from "@/lib/output/issuance-status";
import { injectDraftWatermark } from "@/lib/output/draft-watermark";

const base = {
  lifecycle_state: "issued",
  revoked_at: null,
  superseded_by_id: null,
  expires_at: null,
};

describe("deriveIssuanceDisplayStatus", () => {
  it("returns issued for a clean issued row", () => {
    expect(deriveIssuanceDisplayStatus(base)).toBe("issued");
  });

  it("revoked wins over everything else", () => {
    expect(
      deriveIssuanceDisplayStatus({
        ...base,
        revoked_at: "2026-07-01T00:00:00Z",
        superseded_by_id: 99,
        expires_at: "2000-01-01T00:00:00Z",
      })
    ).toBe("revoked");
  });

  it("superseded wins over expiry", () => {
    expect(
      deriveIssuanceDisplayStatus({
        ...base,
        superseded_by_id: 42,
        expires_at: "2000-01-01T00:00:00Z",
      })
    ).toBe("superseded");
  });

  it("expired when expires_at is in the past", () => {
    expect(
      deriveIssuanceDisplayStatus(
        { ...base, expires_at: "2026-01-01T00:00:00Z" },
        new Date("2026-06-01T00:00:00Z")
      )
    ).toBe("expired");
  });

  it("not expired when expires_at is in the future", () => {
    expect(
      deriveIssuanceDisplayStatus(
        { ...base, expires_at: "2026-12-01T00:00:00Z" },
        new Date("2026-06-01T00:00:00Z")
      )
    ).toBe("issued");
  });

  it("maps failure lifecycle states to failed", () => {
    for (const s of ["failed_retryable", "failed_terminal", "reconciliation_required"]) {
      expect(deriveIssuanceDisplayStatus({ ...base, lifecycle_state: s })).toBe("failed");
    }
  });

  it("maps cancelled and in-flight states", () => {
    expect(deriveIssuanceDisplayStatus({ ...base, lifecycle_state: "cancelled" })).toBe("cancelled");
    for (const s of ["pending", "rendering", "uploaded", null]) {
      expect(deriveIssuanceDisplayStatus({ ...base, lifecycle_state: s })).toBe("in_progress");
    }
  });
});

describe("groupForClass", () => {
  it("classes A and B are official", () => {
    expect(groupForClass("A", "certificate")).toBe("official");
    expect(groupForClass("B", "letter")).toBe("official");
  });

  it("class C forms/checklists group as form", () => {
    expect(groupForClass("C", "form")).toBe("form");
    expect(groupForClass("C", "checklist")).toBe("form");
  });

  it("class D and badge category group as card", () => {
    expect(groupForClass("D", "badge")).toBe("card");
    expect(groupForClass("C", "badge")).toBe("card");
  });
});

describe("injectDraftWatermark", () => {
  it("injects the watermark before </body>", () => {
    const html = "<html><body><p>Letter</p></body></html>";
    const out = injectDraftWatermark(html);
    expect(out).toContain("Draft — Not Officially Issued");
    expect(out.indexOf("Draft — Not Officially Issued")).toBeLessThan(out.indexOf("</body>"));
    expect(out.indexOf("Draft — Not Officially Issued")).toBeGreaterThan(out.indexOf("<p>Letter</p>"));
  });

  it("appends the watermark when no body tag exists", () => {
    const out = injectDraftWatermark("<p>Fragment</p>");
    expect(out).toContain("Draft — Not Officially Issued");
    expect(out.startsWith("<p>Fragment</p>")).toBe(true);
  });

  it("uses position: fixed so the watermark repeats on every printed page", () => {
    expect(injectDraftWatermark("<body></body>")).toContain("position: fixed");
  });
});