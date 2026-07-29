import { describe, it, expect, vi } from "vitest";
import { runIssuance, type IssuancePorts, type RunIssuanceInput } from "../issuance-engine";
import { OutputRenderError } from "../html-adapter";
import { hashFinalPdfBytes } from "../idempotency";
import type { EffectiveOutputPolicy } from "../class-policy";

const POLICY_B: EffectiveOutputPolicy = {
  documentClass: "B",
  qrPolicy: "valid_until_revoked",
  qrValidityDays: null,
  approvalRequired: false,
  allowQuickPrint: true,
  publicDisclosure: "metadata",
  requiresSerial: true,
  official: true,
};

const POLICY_NO_QR: EffectiveOutputPolicy = { ...POLICY_B, documentClass: "G", qrPolicy: "none", official: false };

const PDF = Buffer.from("%PDF-1.7 test-bytes");

function baseInput(overrides: Partial<RunIssuanceInput> = {}): RunIssuanceInput {
  return {
    requestKey: "req_test_1",
    contentFingerprint: "fp_test_1",
    outputCode: "HR_EXPERIENCE_LETTER",
    policy: POLICY_B,
    storagePath: "hr/employee/1/1/doc.pdf",
    fileName: "doc.pdf",
    issueQr: false,
    authorizeReissue: false,
    ...overrides,
  };
}

function makePorts(overrides: Partial<IssuancePorts> = {}): IssuancePorts & {
  transitions: Array<[string, string]>;
} {
  const transitions: Array<[string, string]> = [];
  const storage = new Map<string, Buffer>();
  const ports: IssuancePorts & { transitions: Array<[string, string]> } = {
    transitions,
    findByRequestKey: vi.fn(async () => null),
    findIssuedWithFingerprint: vi.fn(async () => null),
    insertIssuance: vi.fn(async () => ({ id: 101 })),
    transition: vi.fn(async (_id, from, to) => {
      transitions.push([from, to]);
    }),
    createPendingPublicLink: vi.fn(async () => ({
      linkId: 55,
      publicUrl: "https://erp.algt.net/verify/tok",
      qrDataUrl: "data:image/png;base64,QQ==",
    })),
    render: vi.fn(async () => ({ buffer: PDF, rendererVersion: "gotenberg@test" })),
    upload: vi.fn(async (path: string, buf: Buffer) => {
      storage.set(path, buf);
    }),
    downloadStored: vi.fn(async (path: string) => {
      const b = storage.get(path);
      if (!b) throw new Error("object missing");
      return b;
    }),
    activatePublicLink: vi.fn(async () => {}),
    audit: vi.fn(async () => {}),
    ...overrides,
  };
  return ports;
}

describe("issuance engine — canonical lifecycle", () => {
  it("happy path: pending → rendering → uploaded → issued with verified final hash", async () => {
    const ports = makePorts();
    const out = await runIssuance(baseInput(), ports);
    expect(out.kind).toBe("issued");
    if (out.kind !== "issued") return;
    expect(out.finalSha256).toBe(hashFinalPdfBytes(PDF));
    expect(out.idempotentReplay).toBe(false);
    expect(ports.transitions).toEqual([
      ["pending", "rendering"],
      ["rendering", "uploaded"],
      ["uploaded", "issued"],
    ]);
  });

  it("same request key replays the existing issued outcome without duplicating", async () => {
    const ports = makePorts({
      findByRequestKey: vi.fn(async () => ({
        id: 77,
        lifecycle_state: "issued" as const,
        storage_path: "x",
        file_name: "x.pdf",
        checksum: "abc",
        file_size_bytes: 10,
      })),
    });
    const out = await runIssuance(baseInput(), ports);
    expect(out.kind).toBe("issued");
    if (out.kind !== "issued") return;
    expect(out.issuanceId).toBe(77);
    expect(out.idempotentReplay).toBe(true);
    expect(ports.insertIssuance).not.toHaveBeenCalled();
    expect(ports.render).not.toHaveBeenCalled();
  });

  it("equal content without authorization returns a warning, not an issuance", async () => {
    const ports = makePorts({
      findIssuedWithFingerprint: vi.fn(async () => ({ id: 42 })),
    });
    const out = await runIssuance(baseInput(), ports);
    expect(out).toEqual({ kind: "duplicate_content_warning", existingIssuanceId: 42 });
    expect(ports.insertIssuance).not.toHaveBeenCalled();
  });

  it("authorized reissue proceeds and records one-directional supersession", async () => {
    const insertIssuance = vi.fn(async () => ({ id: 102 }));
    const ports = makePorts({
      findIssuedWithFingerprint: vi.fn(async () => ({ id: 42 })),
      insertIssuance,
    });
    const out = await runIssuance(baseInput({ authorizeReissue: true }), ports);
    expect(out.kind).toBe("issued");
    if (out.kind !== "issued") return;
    expect(out.reissued).toBe(true);
    expect(insertIssuance).toHaveBeenCalledWith(
      expect.objectContaining({ supersedesIssuanceId: 42 })
    );
  });

  it("retryable render failure lands in failed_retryable", async () => {
    const ports = makePorts({
      render: vi.fn(async () => {
        throw new OutputRenderError("HTTP 503: overloaded", true);
      }),
    });
    const out = await runIssuance(baseInput(), ports);
    expect(out.kind).toBe("failed_retryable");
    expect(ports.transitions).toEqual([
      ["pending", "rendering"],
      ["rendering", "failed_retryable"],
    ]);
  });

  it("terminal render failure (bad input) lands in failed_terminal", async () => {
    const ports = makePorts({
      render: vi.fn(async () => {
        throw new OutputRenderError("HTTP 400: bad html", false);
      }),
    });
    const out = await runIssuance(baseInput(), ports);
    expect(out.kind).toBe("failed_terminal");
  });

  it("failed upload leaves the token inactive (QR step never reached)", async () => {
    const activatePublicLink = vi.fn();
    const ports = makePorts({
      upload: vi.fn(async () => {
        throw new Error("storage down");
      }),
      activatePublicLink,
    });
    const out = await runIssuance(baseInput({ issueQr: true }), ports);
    expect(out.kind).toBe("failed_retryable");
    expect(activatePublicLink).not.toHaveBeenCalled();
    expect(ports.transitions.at(-1)).toEqual(["rendering", "failed_retryable"]);
  });

  it("stored-byte mismatch enters reconciliation_required", async () => {
    const ports = makePorts({
      downloadStored: vi.fn(async () => Buffer.from("%PDF-1.7 DIFFERENT")),
    });
    const out = await runIssuance(baseInput(), ports);
    expect(out.kind).toBe("reconciliation_required");
    expect(ports.transitions.at(-1)).toEqual(["uploaded", "reconciliation_required"]);
  });

  it("QR link is pre-created before render (embeddable) but activated strictly last", async () => {
    const order: string[] = [];
    const ports = makePorts({
      transition: vi.fn(async (_id, from, to) => {
        order.push(`${from}->${to}`);
      }),
      createPendingPublicLink: vi.fn(async () => {
        order.push("qr-create-pending");
        return { linkId: 9, publicUrl: "https://erp.algt.net/verify/t", qrDataUrl: null };
      }),
      activatePublicLink: vi.fn(async () => {
        order.push("qr-activate");
      }),
    });
    const out = await runIssuance(baseInput({ issueQr: true }), ports);
    expect(out.kind).toBe("issued");
    if (out.kind !== "issued") return;
    expect(out.qr.status).toBe("activated");
    // Pending link exists before rendering starts, activation is the very last step.
    expect(order[0]).toBe("qr-create-pending");
    expect(order.at(-1)).toBe("qr-activate");
    expect(order.at(-2)).toBe("uploaded->issued");
  });

  it("render receives the QR context so the PDF can embed the verification QR", async () => {
    const render = vi.fn(async (ctx: { qr: { publicUrl: string; qrDataUrl: string | null } | null }) => {
      expect(ctx.qr?.publicUrl).toBe("https://erp.algt.net/verify/tok");
      return { buffer: PDF, rendererVersion: "gotenberg@test" };
    });
    const ports = makePorts({ render });
    const out = await runIssuance(baseInput({ issueQr: true }), ports);
    expect(out.kind).toBe("issued");
    expect(render).toHaveBeenCalledOnce();
  });

  it("QR link preparation failure before render is a safe retryable failure", async () => {
    const ports = makePorts({
      createPendingPublicLink: vi.fn(async () => {
        throw new Error("links table unavailable");
      }),
    });
    const out = await runIssuance(baseInput({ issueQr: true }), ports);
    expect(out.kind).toBe("failed_retryable");
    expect(ports.render).not.toHaveBeenCalled();
    expect(ports.transitions).toEqual([["pending", "failed_retryable"]]);
  });

  it("post-issuance QR activation failure keeps the document issued and retryable at link level", async () => {
    const ports = makePorts({
      activatePublicLink: vi.fn(async () => {
        throw new Error("db hiccup at activation");
      }),
    });
    const out = await runIssuance(baseInput({ issueQr: true }), ports);
    expect(out.kind).toBe("issued");
    if (out.kind !== "issued") return;
    expect(out.qr.status).toBe("activation_failed_retryable");
    // Link stays pending_activation → publicly invisible until ops retry.
    expect(ports.transitions.at(-1)).toEqual(["uploaded", "issued"]);
    expect(ports.audit).toHaveBeenCalledWith(
      "output_qr_activation_failed",
      expect.objectContaining({ issuance_id: 101, link_id: 55 })
    );
  });

  it("policy that forbids QR never creates a link", async () => {
    const createPendingPublicLink = vi.fn();
    const activatePublicLink = vi.fn();
    const ports = makePorts({ createPendingPublicLink, activatePublicLink });
    const out = await runIssuance(baseInput({ issueQr: true, policy: POLICY_NO_QR }), ports);
    expect(out.kind).toBe("issued");
    if (out.kind !== "issued") return;
    expect(out.qr.status).toBe("policy_forbids");
    expect(createPendingPublicLink).not.toHaveBeenCalled();
    expect(activatePublicLink).not.toHaveBeenCalled();
  });

  it("reserves an official serial when class policy requires one (OUTPUT.4)", async () => {
    const reserveSerial = vi.fn(async () => ({ serialNo: "HR_NOC-C1-2026-000101" }));
    const ports = makePorts({ reserveSerial });
    const out = await runIssuance(baseInput(), ports); // POLICY_B has requiresSerial: true
    expect(out.kind).toBe("issued");
    if (out.kind !== "issued") return;
    expect(out.serialNo).toBe("HR_NOC-C1-2026-000101");
    expect(reserveSerial).toHaveBeenCalledWith({ issuanceId: 101 });
  });

  it("does not reserve a serial when policy does not require one", async () => {
    const reserveSerial = vi.fn(async () => ({ serialNo: "X" }));
    const ports = makePorts({ reserveSerial });
    const out = await runIssuance(
      baseInput({ policy: { ...POLICY_B, requiresSerial: false } }),
      ports
    );
    expect(out.kind).toBe("issued");
    if (out.kind !== "issued") return;
    expect(out.serialNo).toBeNull();
    expect(reserveSerial).not.toHaveBeenCalled();
  });

  it("serial reservation failure is retryable and happens before any rendering", async () => {
    const ports = makePorts({
      reserveSerial: vi.fn(async () => {
        throw new Error("sequence unavailable");
      }),
    });
    const out = await runIssuance(baseInput(), ports);
    expect(out.kind).toBe("failed_retryable");
    expect(ports.render).not.toHaveBeenCalled();
    expect(ports.transitions).toEqual([["pending", "failed_retryable"]]);
  });

  it("replay of a failed_retryable request reports the retryable state instead of duplicating", async () => {
    const ports = makePorts({
      findByRequestKey: vi.fn(async () => ({
        id: 88,
        lifecycle_state: "failed_retryable" as const,
        storage_path: null,
        file_name: null,
        checksum: null,
        file_size_bytes: null,
      })),
    });
    const out = await runIssuance(baseInput(), ports);
    expect(out.kind).toBe("failed_retryable");
    expect(ports.insertIssuance).not.toHaveBeenCalled();
  });
});
