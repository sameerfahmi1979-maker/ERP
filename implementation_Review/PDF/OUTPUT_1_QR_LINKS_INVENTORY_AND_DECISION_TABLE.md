# OUTPUT.1 — Existing QR Public Links: Non-Destructive Inventory & Decision Table

**Phase:** ERP OUTPUT.1 — Global Security & Data-Model Foundation (WP4)
**Date:** 2026-07-26
**Policy basis:** Plan v6.1 §QR correction — existing links are inventoried and classified,
**never** bulk-cancelled or bulk-reissued. Each category gets an explicit, recorded decision.

---

## 1. Inventory snapshot (live DB, 2026-07-26)

Source: `erp_output_public_links` (`deleted_at IS NULL`), joined to
`erp_generated_pdf_documents` via the new canonical FK `generated_pdf_document_id`.

| Metric | Value |
|---|---|
| Total live links | **13** |
| Status | 13 × `valid` (0 cancelled, 0 expired, 0 superseded) |
| Source | 13 × `HR` / `output_type = letter` |
| Issued range | 2026-07-02 → 2026-07-22 |
| `expires_at` set | 0 of 13 (all open-ended) |
| Bound to a stored PDF (`generated_pdf_document_id`) | 0 of 13 |
| `download_file_path` present | 0 of 13 |
| `download_enabled` | 0 of 13 |
| Total public scans (`view_count`) | 22 (max 6 on link #8; five links never scanned) |

**Finding:** every existing link is a **legacy metadata-only verification link**.
The QR resolves to a verification page showing `public_payload_json` /
`verification_summary_json`; there is **no file** behind any link, so none of them can
"leak" a document. They pre-date the file-bound issuance model introduced in OUTPUT.1.

## 2. Classification

| Category | Definition | Count | Link IDs |
|---|---|---|---|
| L1 — Legacy metadata-only, scanned | No bound file, `view_count > 0` (in circulation) | 7 | 1, 5, 7, 8, 9, 11, 13 |
| L2 — Legacy metadata-only, never scanned | No bound file, `view_count = 0` | 6 | 2, 3, 4, 6, 10, 12 |
| L3 — File-bound legacy links | `download_file_path` or PDF binding present | 0 | — |
| L4 — Cancelled / expired legacy links | Already inactive | 0 | — |

## 3. Decision table

| Category | Decision | Rationale | Action in OUTPUT.1 | Future action |
|---|---|---|---|---|
| L1 (7 links) | **RETAIN, valid until revoked** | Links are printed on letters already handed to employees/authorities. The verification content is truthful metadata; cancelling would break documents in circulation — exactly the harm v6.1 forbids. | None (tagged legacy by absence of `generated_pdf_document_id`). | Revoke individually via Ops Console (OUTPUT.6) only on owner request or supersession. |
| L2 (6 links) | **RETAIN, valid until revoked** | Zero scans suggests the letters may not have been distributed, but cancellation risk (letter printed but never verified yet) outweighs benefit. Non-destructive principle applies. | None. | Same as L1; candidates for review after 12 months of zero scans. |
| L3 (0 links) | n/a | No file-bound legacy links exist. | — | — |
| L4 (0 links) | n/a | Nothing to purge. | — | — |

**Explicitly rejected options** (recorded per v6.1):
- ❌ Bulk cancellation of all 13 links.
- ❌ Bulk reissue/rebinding of legacy links to retroactively generated PDFs
  (would fabricate an issuance record that never existed).
- ❌ Retro-applying the new class-based expiry policy to already-issued links
  (policy snapshots apply at issuance time only).

## 4. Forward rules (new links, OUTPUT.2+)

1. New public links are created **only** by the issuance coordinator, bound to a stored
   PDF via `generated_pdf_document_id` (canonical FK direction: link → issuance).
2. Token activation is the **last** step of the 11-step lifecycle — only from state
   `issued` (`canActivatePublicToken`).
3. `expires_at` is computed from the effective class policy
   (`resolveEffectivePolicy` + `computeQrExpiry`); Class A defaults to 90 days,
   Class B to valid-until-revoked, Class G forbids QR entirely.
4. Legacy links remain distinguishable forever: `generated_pdf_document_id IS NULL`
   ⇒ legacy metadata-only link.
5. The public verification page must render legacy links exactly as before
   (metadata verification), and file-bound links with the policy-controlled
   disclosure level (`none` / `metadata` / `download`).

## 5. Verification queries

```sql
-- Legacy vs file-bound split
SELECT (generated_pdf_document_id IS NULL) AS legacy, count(*), sum(view_count)
FROM erp_output_public_links WHERE deleted_at IS NULL GROUP BY 1;

-- Any link bound to a non-issued PDF (must always be 0 after OUTPUT.2)
SELECT count(*) FROM erp_output_public_links l
JOIN erp_generated_pdf_documents g ON g.id = l.generated_pdf_document_id
WHERE l.status = 'valid' AND g.lifecycle_state <> 'issued';
```
