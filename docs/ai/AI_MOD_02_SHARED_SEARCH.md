# AI-MOD-02 — shared authorized search

Application code is local until the owner requests the combined publication/release. Read the private implementation results for the exact applied-migration identity and acceptance receipts. This stage does not start AI-MOD-03, automatic upload processing, re-review jobs, workflow configuration or provider activation.

## One service and the existing UI

`src/server/ai/search/` owns subject resolution, document-type meaning, hard constraints, current authorization, native totals, pagination and source provenance. Existing server readers/actions call the same services directly. `POST /api/v1/search` exposes the existing `erp-ai/1` foundation contract; it does not accept SQL, table names, arbitrary tools or client authority. Existing Fluent/Dynamics styling, compact embedded lists, workspace/drafts and protected save operations remain in place.

```json
{
  "contractVersion": "erp-ai/1",
  "capabilityId": "dms.metadata",
  "query": "ISO certificates",
  "mode": "keyword",
  "filters": [],
  "pageSize": 25,
  "cursor": null
}
```

Current API capabilities: `dms.metadata`, `global.search`, `hr.search`, `company.metadata`, `branch.metadata`, `party.metadata`, `site.metadata`. All require the owning domain's current permissions and native RLS. The global search permission never grants HR, master-data or document access. Other registered capabilities retain their declared stage/hold; registration is not activation or a permission grant.

Optional `context` is an exact existing `{entityType, entityId}` reference. Document context supports employee, dependent, company, branch, party and site; `dependent` maps to the stored `employee_dependent` link type. A name cannot switch an already-selected subject. An ambiguous person asks for clarification; a dependent's surname/OCR text does not establish an employee relationship. Authorized English/Arabic employee and dependent names and exact business codes use the same normalization rules. No aliases or actual relationships are written by search.

## Adoption and boundaries

| Family | Current adapter |
| --- | --- |
| All Documents, DMS Browser | Same document kernel, configured type aliases, exact subject, active filters and native count/page. |
| HR Document Browser | Exact selected employee/dependent union remains authoritative; matching DMS members uses the same subject-bound kernel. HR-only identity rows remain an explicitly different owning source. |
| HR search | Existing category permissions and owning reads; actual HR document/pass/training types remain distinct from DMS type IDs. |
| Global search and masters | One native aggregate over permitted companies/branches/parties/sites/documents, with canonical routes. |
| Add Link / attach selectors | Registered entity type and literal conjunctive terms, retaining parent authorization and owning-query limits. Unsupported vehicle linking is held explicitly. |
| Approval status/history | Existing owning reads, one actor and final authority check. Pool eligibility is not an assigned reviewer or proof of notification delivery. |

Ordinary navigation, local form/list filtering, reports and business selectors keep their existing domain contracts. They do not acquire cross-domain AI access. `tooling/ai/search-adoption.mjs` records every current and prior stable consumer identifier with its adopted family, owning-contract exception or explicit later-stage disposition. Static disposition is separate from runtime evidence. Assistant/tool/form adoption is stage 3; upload/re-review and AP-01–AP-04 approval-engine changes are stage 4; quality/operations consolidation is stage 5.

## Honest results

- Hard filters combine with AND. Typed subject/type/company/branch/lifecycle/date/metadata criteria never disappear after a provider suggestion. Unknown/unsearchable metadata stays unavailable, rather than becoming a false empty success. Literal punctuation cannot turn into an unrestricted search.
- Document and global totals are native exact totals for the authorized current query. A missing/truncated/inconsistent count is a failure. An exhausted later page can have no rows while the query still has matches; it is not a zero-match query.
- AI/semantic suggestions remain gated by existing flags/providers and explicitly bounded. They are intersected with the same current constraints; an empty semantic preview does not establish that the full database has no matches. Continuation reuses the extracted intent rather than repeating its model call.
- Semantic paraphrases are soft wording. Resolved person/type/context, explicit filters, expiry and identifier/standard numbers stay hard constraints; a semantic suggestion is not forced to repeat every ordinary query word in its OCR text. Inactive/forced-password accounts are stopped before provider dispatch.
- Cursors are continuation metadata, not access tokens. They bind actor/scope/query/criteria/Dubai day; document cursors additionally recheck an anchor and total. Pages are **fresh authorized pages**, not a pinned database snapshot or export-consistency guarantee.
- Cancellation/deadlines, account/scope changes and revoked permissions fence late responses and retained UI results. Search does not use a shared sensitive-answer cache.
- Canonical `provenance` follows the foundation evidence schema: current source table/record/business reference/revision, access purpose and observation time. A bounded permitted OCR excerpt can be attached. Aggregated search content has no verified individual file/page, so `fileId` and `page` stay null. The returned `current_version_id` and compatibility `evidence.fileVersionId` identify the **document version**, never an individual source-file ID.

`POST /api/v1/search/approval-status` accepts `documentId`, optional `page`/`pageSize`, and returns current permitted state/history plus explicit mapping/delivery holds. Read hints deny self-approval including administrators. The legacy database transition bypass and real company/type/assignee/notification configuration remain stage-4 work; this read-only endpoint does not claim to fix or activate that engine.

## Extension and verification

New modules declare actual sources/fields, sensitivity, scope, supported filters/count semantics and owning permissions in the existing capability register; add a narrow owning adapter and allow/deny/completeness/failure cases before admitting it in the service. Future modules do not inherit arbitrary SQL, write access, roles or an administrative bypass.

Run the final Node/jsdom suite using `tests/ai-mod02/vitest.final.config.mts`. These component simulations do not launch or control a browser. Native scripts require a verified labelled, network-disabled synthetic PostgreSQL container and fresh authorized schema-only snapshots. The packet builder `tooling/ai/search-migration-packet.mjs` is offline: it creates only an exact guarded migration/history packet; it never connects or applies it. Do not blindly push historical migrations or publish the private snapshots/evidence.

Direct deterministic lookups invoke no model. Ordinary document reads use three data calls in the SDK fixture; subject/excerpt/anchor reads can bring the usual path to six, excluding fresh authentication/bootstrap checks. Large configuration catalogs and the retained multi-category HR fan-out are bounded exceptions, not a claim of six physical reads for every ERP question. The plan's limits are engineering targets, not a production-volume or provider-quality guarantee.

No real provider call, live employee/role/link update, document reprocessing, browser/phone/visual test or paid evaluation is implied by these local checks. Owner visual/mobile/keyboard acceptance remains deferred until actually performed.
