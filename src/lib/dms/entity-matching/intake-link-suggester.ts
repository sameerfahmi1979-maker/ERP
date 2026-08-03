/**
 * HR.DOCLINK.1A — Intake entity link suggester
 *
 * Builds employee / dependent / party link suggestions for the AI Intake
 * Review screen from the AI extraction result:
 *
 *  - Identity numbers (Emirates ID, passport) matched against
 *    employee_identity_documents and employee_dependents → EXACT matches,
 *    pre-ticked (decision D2: only exact identity-number matches pre-tick).
 *  - Person names matched against employees / dependents → listed, unticked.
 *  - AI party matches (suggested_links_json) → listed, unticked.
 *
 * Read-only. No links are written here — the human's Approve click applies
 * the ticked suggestions (Phase 13 human-review rule respected).
 */

import type { createAdminClient } from "@/lib/supabase/admin";

export type IntakeLinkSuggestion = {
  entityType: "employee" | "employee_dependent" | "party";
  entityId: number;
  entityName: string;
  matchReason: string;
  confidence: number;
  /** D2 — true only for exact identity-number matches */
  preTick: boolean;
};

type AdminClient = ReturnType<typeof createAdminClient>;

// ── Field extraction helpers ──────────────────────────────────────────────────

/** Keys whose values represent the document holder's name */
const NAME_KEY_PATTERNS = [
  /^full_name(_en(glish)?)?$/,
  /^holder_name$/,
  /^person_name$/,
  /^employee_name$/,
  /^visa_holder_name$/,
  /^name_en$/,
];

/** Keys that must NOT be treated as the holder (companies/authorities) */
const NAME_KEY_EXCLUDES = /sponsor|employer|issuing|authority|company|agent/;

function normalizeIdNumber(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/**
 * Token-overlap score between an extracted holder name and a stored name.
 * Handles middle-name/spelling differences that substring matching misses.
 * Returns 0.95 for an exact normalized match; otherwise the fraction of
 * extracted tokens found in the stored name (0 unless >= 2 tokens match).
 */
export function nameTokenOverlap(extracted: string, stored: string): number {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z\u0600-\u06FF\s]/g, " ").replace(/\s+/g, " ").trim();
  const a = norm(extracted);
  const b = norm(stored);
  if (!a || !b) return 0;
  if (a === b) return 0.95;

  const aTokens = a.split(" ").filter((t) => t.length >= 3);
  const bTokens = new Set(b.split(" ").filter((t) => t.length >= 3));
  if (aTokens.length === 0 || bTokens.size === 0) return 0;

  const matched = aTokens.filter((t) => bTokens.has(t)).length;
  if (matched < 2) return 0;
  return Math.round((matched / aTokens.length) * 100) / 100;
}

export function extractIdentitySignals(fields: Record<string, unknown> | null | undefined): {
  names: string[];
  emiratesIds: string[];
  passportNumbers: string[];
} {
  const names: string[] = [];
  const emiratesIds: string[] = [];
  const passportNumbers: string[] = [];
  if (!fields) return { names, emiratesIds, passportNumbers };

  const visit = (obj: Record<string, unknown>) => {
    for (const [rawKey, rawValue] of Object.entries(obj)) {
      if (rawKey === "__additional_fields" && rawValue && typeof rawValue === "object") {
        if (Array.isArray(rawValue)) {
          // Production shape: [{ label: "Passport Number", value: "A0023...", confidence }]
          const mapped: Record<string, unknown> = {};
          for (const entry of rawValue) {
            const e = entry as { label?: unknown; value?: unknown };
            if (typeof e?.label === "string" && typeof e?.value === "string") {
              const normKey = e.label
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "");
              mapped[normKey] = e.value;
            }
          }
          visit(mapped);
        } else {
          visit(rawValue as Record<string, unknown>);
        }
        continue;
      }
      if (typeof rawValue !== "string" || !rawValue.trim()) continue;
      const key = rawKey.toLowerCase();
      const value = rawValue.trim();

      if (key.includes("emirates_id") || key === "eid_number" || key === "eid") {
        const norm = normalizeIdNumber(value);
        if (norm.length >= 10) emiratesIds.push(norm);
      } else if (key.includes("passport") && (key.includes("number") || key.includes("no"))) {
        const norm = normalizeIdNumber(value);
        if (norm.length >= 5) passportNumbers.push(norm);
      } else if (
        NAME_KEY_PATTERNS.some((p) => p.test(key)) &&
        !NAME_KEY_EXCLUDES.test(key)
      ) {
        if (value.length >= 3 && value.length <= 120) names.push(value);
      }
    }
  };

  visit(fields);

  return {
    names: [...new Set(names)],
    emiratesIds: [...new Set(emiratesIds)],
    passportNumbers: [...new Set(passportNumbers)],
  };
}

// ── Suggestion builder ────────────────────────────────────────────────────────

export async function buildIntakeLinkSuggestions(
  admin: AdminClient,
  input: {
    extractedFields: Record<string, unknown> | null;
    suggestedLinksJson: unknown[] | null;
  }
): Promise<IntakeLinkSuggestion[]> {
  const { names, emiratesIds, passportNumbers } = extractIdentitySignals(input.extractedFields);
  const suggestions: IntakeLinkSuggestion[] = [];
  const seen = new Set<string>();

  const push = (s: IntakeLinkSuggestion) => {
    const key = `${s.entityType}:${s.entityId}`;
    const existing = suggestions.find((x) => `${x.entityType}:${x.entityId}` === key);
    if (existing) {
      // Keep the strongest signal
      if (s.confidence > existing.confidence) {
        existing.confidence = s.confidence;
        existing.matchReason = s.matchReason;
        existing.preTick = existing.preTick || s.preTick;
      }
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(s);
  };

  const hasIdNumbers = emiratesIds.length > 0 || passportNumbers.length > 0;

  // ── 1. Exact identity-number matches → employees (pre-tick, D2) ───────────
  if (hasIdNumbers) {
    const { data: idDocs } = await admin
      .from("employee_identity_documents")
      .select("employee_id, document_number, employee:employees(id, full_name_en, employee_code, deleted_at)")
      .not("document_number", "is", null)
      .is("deleted_at", null)
      .limit(5000);

    for (const raw of idDocs ?? []) {
      const r = raw as Record<string, unknown>;
      const empRaw = r.employee as Record<string, unknown> | Record<string, unknown>[] | null;
      const emp = Array.isArray(empRaw) ? empRaw[0] : empRaw;
      if (!emp || emp.deleted_at != null) continue;
      const norm = normalizeIdNumber((r.document_number as string) ?? "");
      if (!norm) continue;

      if (emiratesIds.includes(norm)) {
        push({
          entityType: "employee",
          entityId: emp.id as number,
          entityName: `${emp.full_name_en} (${emp.employee_code})`,
          matchReason: "Emirates ID number matches this employee's identity document",
          confidence: 1,
          preTick: true,
        });
      } else if (passportNumbers.includes(norm)) {
        push({
          entityType: "employee",
          entityId: emp.id as number,
          entityName: `${emp.full_name_en} (${emp.employee_code})`,
          matchReason: "Passport number matches this employee's identity document",
          confidence: 1,
          preTick: true,
        });
      }
    }

    // ── 2. Exact identity-number matches → dependents (pre-tick, D2) ────────
    const { data: dependents } = await admin
      .from("employee_dependents")
      .select("id, dependent_name_en, passport_number, emirates_id_number, employee:employees(full_name_en)")
      .is("deleted_at", null)
      .limit(5000);

    for (const raw of dependents ?? []) {
      const r = raw as Record<string, unknown>;
      const empRaw = r.employee as { full_name_en?: string } | { full_name_en?: string }[] | null;
      const emp = Array.isArray(empRaw) ? empRaw[0] : empRaw;
      const label = `${r.dependent_name_en}${emp?.full_name_en ? ` — dependent of ${emp.full_name_en}` : ""}`;
      const depEid = normalizeIdNumber((r.emirates_id_number as string) ?? "");
      const depPassport = normalizeIdNumber((r.passport_number as string) ?? "");

      if (depEid && emiratesIds.includes(depEid)) {
        push({
          entityType: "employee_dependent",
          entityId: r.id as number,
          entityName: label,
          matchReason: "Emirates ID number matches this dependent",
          confidence: 1,
          preTick: true,
        });
      } else if (depPassport && passportNumbers.includes(depPassport)) {
        push({
          entityType: "employee_dependent",
          entityId: r.id as number,
          entityName: label,
          matchReason: "Passport number matches this dependent",
          confidence: 1,
          preTick: true,
        });
      }
    }
  }

  // ── 3. Name matches (unticked) — token-overlap scoring ────────────────────
  // Substring matching misses common spelling variations ("Abu Alayan" vs
  // "Abu Elayyan"), so we score by shared name tokens instead.
  if (names.length > 0) {
    const [empRes, depRes] = await Promise.all([
      admin
        .from("employees")
        .select("id, full_name_en, employee_code")
        .is("deleted_at", null)
        .limit(2000),
      admin
        .from("employee_dependents")
        .select("id, dependent_name_en, employee:employees(full_name_en)")
        .is("deleted_at", null)
        .limit(2000),
    ]);

    for (const name of names.slice(0, 3)) {
      for (const emp of empRes.data ?? []) {
        const score = nameTokenOverlap(name, (emp.full_name_en as string) ?? "");
        if (score < 0.5) continue;
        push({
          entityType: "employee",
          entityId: emp.id as number,
          entityName: `${emp.full_name_en} (${emp.employee_code})`,
          matchReason: `Document holder name "${name}" ${score >= 0.95 ? "matches" : "is similar to"} this employee`,
          confidence: score,
          preTick: false,
        });
      }

      for (const raw of depRes.data ?? []) {
        const r = raw as Record<string, unknown>;
        const score = nameTokenOverlap(name, (r.dependent_name_en as string) ?? "");
        if (score < 0.5) continue;
        const empRaw = r.employee as { full_name_en?: string } | { full_name_en?: string }[] | null;
        const emp = Array.isArray(empRaw) ? empRaw[0] : empRaw;
        push({
          entityType: "employee_dependent",
          entityId: r.id as number,
          entityName: `${r.dependent_name_en}${emp?.full_name_en ? ` — dependent of ${emp.full_name_en}` : ""}`,
          matchReason: `Document holder name "${name}" ${score >= 0.95 ? "matches" : "is similar to"} this dependent`,
          confidence: score,
          preTick: false,
        });
      }
    }
  }

  // ── 4. AI party matches (unticked, already vetted names from AI pass) ─────
  if (Array.isArray(input.suggestedLinksJson)) {
    for (const raw of input.suggestedLinksJson.slice(0, 8)) {
      const l = raw as Record<string, unknown>;
      if (l?.entityType !== "party" || typeof l.entityId !== "number") continue;
      push({
        entityType: "party",
        entityId: l.entityId,
        entityName: String(l.entityName ?? `Party #${l.entityId}`),
        matchReason: String(l.reason ?? "AI matched a name in the document to this party"),
        confidence: typeof l.confidenceScore === "number" ? l.confidenceScore : 0.5,
        preTick: false,
      });
    }
  }

  // Strongest first
  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions.slice(0, 10);
}
