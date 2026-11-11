# AI-MOD-01 — AI foundation and adoption contract

This records the foundation snapshot for the existing five-stage ERP AI plan. The foundation itself did not enable a new search API, identity/name resolver, module tool, upload pipeline, approval workflow, provider or user permission. Subsequent shared-search adoption is recorded separately in [AI-MOD-02](AI_MOD_02_SHARED_SEARCH.md). Preserve the existing Fluent/Dynamics-inspired UI, compact lists, OCR/provider routing and F03/F04/F07/F10 controls.

## Source and execution boundaries

The canonical checkout is C:/dev/agt-erp. Preserve unrelated employee-document, report-template, photo and ISO-search changes. All application/frontend/server changes stay local for the owner's later combined publication/deployment. Necessary verified compatible database changes follow the owner-approved direct-migration procedure; do not blindly apply the historical migration directory or another chat's migrations.

Private source hashes, full inventory, schema/policy snapshots, test logs and migration receipts belong under `CODEX_AUDIT_13_09_2026/IMPLEMENTATION/AI_MOD_01_20261030/`. Never publish credentials, business rows or private access inventories. A migration applied to the database and a local application change are separate recorded states.

## Stable inventories and ownership

`tooling/ai/foundation-inventory.mjs` inspects every production TypeScript/TSX/MTS file under `src`, excluding declarations and tests. It records hashes for inspected files with and without matching controls. Stable consumer identifiers use path, enclosing function/declaration, kind and symbol; they do not use line numbers. The register captures pages, search controls and calls, selectors, secondary form/review/upload components, AI imports, registered AI fields, ordinary form/schema bindings, table/RPC reads and literal select fields. It makes no provider/database call.

Each entry has a disposition. Ordinary UI filters are not silently replaced with AI; their loaded-set versus server-query behavior stays with their owning adapter. Dynamic bindings/queries are explicitly held for the owning service rather than assigned guessed tables/fields. The source/schema index records all captured public columns and permission definitions, while the capability register declares reviewed initial source examples. Static inventory is not proof of later-stage caller adoption or unrestricted AI eligibility.

| Plan register | Current source families | Delivery owner |
| --- | --- | --- |
| SEARCH-01 | All Documents and DMS documents read | AI-MOD-02 |
| SEARCH-02 | DMS Browser and its document/content reads | AI-MOD-02 |
| SEARCH-03 | HR employee/dependent Document Browser | AI-MOD-02 |
| SEARCH-04 | HR search and employee/subject access | AI-MOD-02/03 |
| SEARCH-05 | Common/global ERP search collectors | AI-MOD-02 |
| SEARCH-06 | Assistant and document Q&A | Foundation repairs in 01; new capabilities in 03 |
| SEARCH-07 | Attachment/link/photo/employee-from-document selectors | Matching in 02; transaction/re-review adoption in 04 |
| SEARCH-08 | Lookup/master/list searches and secondary dialogs | 02; retain domain eligibility and exact counts |
| SEARCH-09 | Sidebar/navigation/help | Canonical-link prerequisites in 01; approved guidance in 03 |
| SEARCH-10 | Future modules | Must register before activation; unknown adapters remain unsupported |

`src/lib/ai/foundation/capabilities.ts` declares initial company, branch, party, site, DMS, HR employee/dependent/identity/access-card/recruitment/time/payroll/operations/actions, report, notification, email and audit source families. These declarations are not executable tools. The complete inventory supplements them; no undeclared finance/supply/clinical field receives access merely by being inventoried.

Every new capability must declare stable identity, owning module/service, actual table/field authority, permissions, record/parent scope, sensitivity, supported filters, count semantics, version/time/provenance and acceptance cases. Use the existing domain read contracts for authorization and business meaning. An AI/configuration administrator does not gain underlying document, medical, payroll or employee authority.

## Strict shared contracts

`src/lib/ai/foundation/contracts.ts` defines version `erp-ai/1` using strict schemas. Unknown properties, arbitrary SQL, unsupported tool/filter identifiers and invalid record identities are rejected. Parsing is not authorization and does not activate a planned adapter.

| Contract | Boundary |
| --- | --- |
| Capability/source catalog | Actual sources, authority category, sensitivity, parent scope and explicit planned/partial/held/unsupported disposition |
| Search request | Registered capability, bounded query/mode/filters/page/cursor; client criteria can narrow but never grant scope |
| Answer | Available/clarification/no-matches/partial/unavailable/unsupported/held; exact count versus preview/unknown remains explicit |
| Evidence | Source table/field, verified entity, business reference, version, access purpose, file/page when real and observed time; a page requires an actual source file |
| Policy | Company/branch applicability, approved/effective version and retained evidence; no invented policy or legal interpretation |
| Processing profile | Document type, metadata fields, prompt/schema versions, reminder-policy reference and explicit activation/approval identity |
| Feedback | Actual run/answer/source identities and structured correction category; no automatic training or business update |
| Approval route | Company/type/version, original submitter, explicit assigned users, approved decision rule and notification readiness; no self-approval including administrators |

CAP-01–CAP-12 and AUTO-01–AUTO-12 keep their original lead delivery stages. Policy/profile activation, actual document comparisons, highlights, analytics, briefings and the operations centre are not implemented by defining their interfaces.

## Foundation repairs

1. Assistant compliance reads use the actual `finding_type`, `ai_reason` and `recommended_action` columns. Duplicate reads use `entity_type_a/entity_id_a`, `entity_type_b/entity_id_b` and `confidence_score`. Type and ID must match on the same side. A failed or unverifiable read never becomes an empty successful result or a compliance/good-standing certificate.
2. Known-ID navigation first checks the owning permission and current user-scoped row access; it then builds a canonical route using a verified label/business code. Missing/unauthorized records share an existence-safe response. This is not the later name/relationship resolver. Opposite duplicate sides also require authorization; inaccessible sides are not counted as permitted results.
3. Informational workflow questions may mention delete/approve/send. A separate imperative remains blocked, and the executable action allowlist still has no dangerous business mutation. Strict extracted intent and positive safe IDs do not confer record authority.
4. Search/compliance/duplicate explanation counts are described as bounded previews. Actual source failures stay errors. Exact cross-screen retrieval/count adoption belongs to AI-MOD-02.
5. Conversation sessions, messages and drafts are owner-only, including for AI/global administrators. The additive database migration retains existing permissive and F03 restrictive policies and adds owner restrictions; no historical rows or real roles are changed.
6. Local history readers require current session validity, owner identity, an authority fingerprint, source references and source versions. Permission, company/branch, account, password or source changes withhold retained content. Legacy/unbound content is preserved but not replayed. Composite OCR/summary/signal outputs remain withheld from replay until their full evidence adapter is available; this is an intentional fail-closed disposition, not a claim of completed document-evidence adoption.
7. Prompt/answer history is appended as one pair after actual source binding is known. A failed history write is unconfirmed, not success; no automatic model rerun. Draft creation uses the user's client and source binding, not a service-role write. Failed draft persistence cannot advertise a saved draft. Durable full conversation recovery remains a separate owning-contract extension if later needed.

New application changes are local. Until the owner releases that application, its source-binding/error/navigation repairs must not be described as live functionality. The database receipt identifies only the migration actually applied.

## Approval and business holds

### Reconciled schema decisions for later delivery

The current schema has 302 public table/view objects and 5,762 captured columns. The read-only configuration inventory contains 359 non-deleted metadata definitions across 71 document types; 346 definitions have the extractable flag, which alone grants no AI eligibility or access. Current rules, field visibility, active state and domain permissions remain authoritative. The Common AI registry separately contains 23 declared company/party fields; branch/site generation remains stubbed.

| Requirement | Actual storage/relationship | Minimal design decision; not a new migration in stage 1 |
| --- | --- | --- |
| Employee/dependent identity | `employees.id/employee_code`, `employee_dependents.employee_id/dependent_name_en`, `dms_document_links.entity_type/entity_id/link_role/is_primary` | Use stored subject/parent IDs and owning reads. Resolve aliases and employee/dependent adapter values in stage 2; never derive ownership from names, sponsor/uploader or an alias. |
| DMS metadata | `dms_metadata_definitions.document_type_id/field_code/metadata_version`, field rules/visibility, `dms_document_metadata_values.definition_id` and typed value columns | Reuse existing definitions and typed values, with reviewed candidates separated from effective business values. A new profile references definition/version IDs rather than copying the field master. |
| Type/profile preparation | `dms_document_types.type_code/ai_extraction_schema/requires_expiry_tracking/requires_approval/allowed_entity_types`, existing extraction results/jobs | Reuse type/schema/rules and current job receipts; record profile/prompt/schema/source versions. Extend existing run/candidate provenance only where an actual missing version/snapshot requires it. No new parallel OCR/metadata store. |
| Company/type approval | Existing workflows, steps, type junction and approval fingerprints; current workflow schema has no company scope or explicit assignee field | Stage 4 needs an exact scoped-applicability extension, step-assignee configuration and immutable per-submission assignment/version snapshot. Prefer narrow FK-backed junctions/extensions to these objects after schema review; proposed objects are not declared to exist or created here. Preserve F07 fingerprints and F10 event identity; freeze/update assignments through controlled append-only decisions, never mutate history. |
| Current versus historical evidence | Existing document versions, reviewed extraction, original files, metadata and linked HR records | Authoritative HR facts remain HR facts. OCR/summary can be proposed or historical; never silently override reviewed fields. File/page/version precision must be demonstrated by the stage 4 adapter. |
| History privacy | Existing session owner and message `safe_metadata_json`; draft `draft_payload_json` | Stage 1 uses existing JSON for versioned source bindings and three additive ownership policies. No new conversation table, real mapping or copied business record is needed. |

The current read-only workflow inventory has zero configured workflows, steps or type links. Explicit company/type applicability, assignees, decision/quorum/delegation rules and notification-role corrections therefore remain business-held, with no guessed default. Existing HR `approval_roles`/`hr_approval_workflows` are distinct domain contracts; an unmapped label is not a DMS reviewer identity. These design decisions reserve compatible extensions for their owning stages without starting AI-MOD-02 or AI-MOD-04.

AP-01–AP-04 are designed here and delivered by AI-MOD-04 through the existing F05/F07/F10 engine. Resolve an explicitly approved company/type workflow version, preserve branch restrictions, record actual assigned eligible reviewers and recheck them on action. Missing mappings/conflicting workflows are held, with no first-match fallback or AI-inferred reviewer. Preserve original submitter and immutable decisions through delegation/reassignment. Notification gaps require authorized configuration review; reliable F10 events/retries do not authorize role grants, real email tests or worker activation.

No real employee-user/manager links, roles or named approvers are selected by this foundation. Quorum/delegation rules, policy/profile/reminder business ownership and previously held stock-owner, clinical, bank/WPS/statutory or official-wording decisions remain held. The owner's no-self-approval instruction is settled; the live administrator bypass is a recorded AI-MOD-04 repair, not an approved exception.

## Evaluation, budgets and dependency decisions

`quality-cases.ts` records twelve synthetic specification families: exact identity, cross-scope privacy, ISO/identifiers, source conflicts, history ownership, failed reads, duplicate pairing, canonical links, independent approval, response-loss recovery, real Arabic evidence and bounded work. Later-stage cases are specifications, not claimed model evaluations.

`budget.ts` defines a finite deadline/cancellation fence, at most two model calls and six read calls per ordinary turn, and zero model calls for a declared direct lookup. Retries consume the same budget. These are engineering targets/contracts: the existing legacy search collector fan-out has not been converted here into the later shared service and must not be advertised as meeting six database reads end-to-end. Preserve existing configured rate/token/spend safeguards; unknown monetary cost remains unknown. No paid evaluation or provider/model change is authorized.

| Component | Foundation decision |
| --- | --- |
| Current ERP services, Postgres relationships, Zod and provider bridge | Reuse; no new API application, graph database, vector subscription or framework required |
| SAP/Oracle/Microsoft features | Behavior/architecture references only; preserve the existing ERP UI and domain authority |
| Paperless-ngx/AI/GPT, Onyx, Frappe Insights | Design references; no deployment or code import, with exact edition/licence review required before reuse |
| Docling | Optional parsing-adapter evaluation candidate for stage 4; no installation. Benchmark current formats/Arabic, provenance, resources, code/model licences and costs before selection |

## Verification and handoff

Use source review, strict contract and server-action/engine tests, necessary shipping type/lint/build/security checks and isolated native database tests. Native ownership tests restore the captured table-column/policy shape; identity/principal helper functions are controlled fixtures. They prove the changed ownership policies and inherited-denial composition, not a new full Supabase Auth/F03 certification. Preserve original setup failures and retests.

Refresh the live catalog immediately before applying the exact migration. Compare existing-policy hashes, retain a technical reverse/forward-repair procedure and verify the migration history and three additive policies afterward. Do not repair or apply unrelated history. Source checksums bind all results; private evidence and original pre-existing-change hashes stay local.

Browser, visual, keyboard/mobile, touch and provider-backed quality acceptance are unperformed unless separately authorized and performed. AI-MOD-01 technical foundation completion is not completion of stages 2–5 or an online application release.
