/**
 * ERP PDF Generation — Print Token (short-lived signed JWT for secure print routes)
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 *
 * Tokens allow Gotenberg to fetch a private print route without a user session.
 * They expire in 120 seconds and are single-use by design (short TTL).
 *
 * Env: PDF_PRINT_TOKEN_SECRET=<random-secret-min-32-chars>
 */

import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_SECRET = process.env.PDF_PRINT_TOKEN_SECRET ?? "";
const TOKEN_TTL_SECONDS = 120;

export interface PrintTokenPayload {
  templateKey: string;
  recordType: string;
  recordId: number;
  userId: number;
  ownerCompanyId: number;
  exp: number; // unix timestamp (seconds)
}

function base64url(s: string): string {
  return Buffer.from(s).toString("base64url");
}

function fromBase64url(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

/**
 * Signs a print token that Gotenberg can use to fetch the print route.
 */
export function signPrintToken(payload: Omit<PrintTokenPayload, "exp">): string {
  if (!TOKEN_SECRET || TOKEN_SECRET.length < 32) {
    throw new Error(
      "[PDF] PDF_PRINT_TOKEN_SECRET is not set or too short (min 32 chars). Cannot sign print tokens.",
    );
  }

  const full: PrintTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };

  const body = base64url(JSON.stringify(full));
  const sig = createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * Verifies a print token and returns its payload.
 * Throws if the token is invalid, expired, or tampered.
 */
export function verifyPrintToken(token: string): PrintTokenPayload {
  if (!TOKEN_SECRET || TOKEN_SECRET.length < 32) {
    throw new Error("[PDF] PDF_PRINT_TOKEN_SECRET is not configured.");
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("[PDF] Invalid print token format.");
  }

  const [body, sig] = parts;
  const expectedSig = createHmac("sha256", TOKEN_SECRET)
    .update(body!)
    .digest("base64url");

  const sigBuf = Buffer.from(sig!, "base64url");
  const expectedBuf = Buffer.from(expectedSig, "base64url");

  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new Error("[PDF] Print token signature is invalid.");
  }

  const payload = JSON.parse(fromBase64url(body!)) as PrintTokenPayload;

  if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error("[PDF] Print token has expired.");
  }

  return payload;
}
