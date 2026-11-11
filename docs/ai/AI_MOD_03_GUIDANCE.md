# AI-MOD-03 — Current-source Assistant and reviewed form guidance

Application changes remain local. No provider/worker activation, paid evaluation, business-data change, publication or deployment is implied. Existing OCR, compact lists, approvals and F03/F04/F06/F07 save/recovery controls are retained.

## Questions and authority

The existing `/assistant` conversation uses `src/server/ai/assistant/questions.ts` for general facts/guidance. `POST /api/v1/assistant/query` exposes the same strict, private/no-store read contract to other admitted callers. Its input is `{question, context?}`; a context is a registered numeric ERP reference, never an access grant. Unknown keys/tools/SQL are rejected.

Known questions use no model call. Other questions allow one bounded classification attempt through the existing provider bridge; the classifier returns only a registered tool/grouping/period, never facts, IDs, a rewritten person query or SQL. Source text never enters the classifier. A deadline fences late delivery without claiming upstream provider cancellation; there is no automatic paid retry. Actual provider/Arabic quality requires separately authorised evaluation.

- Document expiry/link questions reuse AI-MOD-02 exact subject/type/native search. Dates/status are deterministic in Dubai time. Missing expiry stays unknown; multiple passes/people require clarification. Accessible linked HR identity/card expiry conflicts require reconciliation, not an automatic overwrite or choice of authority.
- Employee/dependent questions follow stored IDs, minimal HR columns and native RLS. Employee joining date/status have typed current-field reads. Pronouns require a retained owner/authority/source-version-bound subject; no inferred account/manager/family mapping.
- Approval explanations consume the existing authorised state/history reader. Company/type routing, named reviewers and delivery remain visibly held until the stage-4 mapping/engine correction. No role pool is presented as an assigned approver and this service never decides an approval.
- Informational navigation and renewal/correction help link to the actual record. Drafts and specialised risk/compliance/duplicate/document explanations retain their existing owning actions. A normal commit, approval, send, deletion or role change is never an informational answer side effect.

## Policy knowledge

The existing `system_settings` store may contain category `AI`, key `ERP_AI_APPROVED_POLICY_SOURCES`, with the strict `policyLibrarySchema` value. It registers retained DMS document/version, business code/revision, real company/branches, state and effective period. No row or policy wording is created by this implementation. Existing settings administration remains authoritative; the reader uses the user's client and does not bypass configuration RLS.

Missing/inaccessible configuration, inapplicable/draft/withdrawn/obsolete versions, overlapping approvals or changed DMS ownership/version/approval stay held. Applicable sources must also have recorded DMS approval and current source access. Answers cite bounded, permitted matching passages where available and remain partial; a source list/excerpt is not a complete policy, legal opinion or approval of an exception. Historical text that cannot be bound to its retained exact source remains held. New business wording/authority is never inferred.

## Reports and briefing

Document counts and status/type/expiry/company/branch/site groups use deterministic code and the same scoped criteria. A report scans at most five pages of 100 documents. Exact native total and incomplete grouped preview are separate; more than 500 matches is explicitly partial. Pages retain the existing fresh-authorised-page contract, not a pinned/serializable snapshot. Failed/overlapping/changed pages are rejected. Source/label access is checked for company/branch/site groups. Site grouping uses permitted stored associations and counts a document once per site; it is not an inferred primary site, and multi-site group totals need not equal document totals.

The existing daily dashboard supplies risk, compliance, duplicate, pending suggestion and processing sections; permitted expiring documents supply a bounded renewal list. Failed sections stay unknown; no all-clear is inferred. This is another presentation of existing work, not a second event/notification/reminder queue. Existing dashboard/catalog/auth/HR/grouping reads are documented exceptions to the ordinary six-read engineering target, not evidence that every turn meets it. No arbitrary finance/pay/medical/stock aggregate or guessed join is admitted.

No saved report, export or schedule is silently created. Links labelled All Documents do not claim to preserve unsupported list URL filters. Actual report issuance/export remains in its owning reviewed workflow.

## Form suggestions and save safety

Company/party suggestion generation/application keep their accepted existing transactions. Branch/site forms reuse the same canonical eligible field definitions through a read-only reviewed-metadata adapter. The site field is the actual `access_notes`, not a nonexistent `access_restrictions` column.

Only unambiguous eligible text/date metadata with exact field codes can become proposals. Existing records use explicitly linked sources in their real company; new records use explicitly selected permitted company documents. No protected code/FK/status/role/manager/pay/medical field is registered. Invalid/conflicting/missing evidence is held. Legacy branch/site model-generation/direct-apply stubs remain disabled: enabling those unreviewed paths is unnecessary.

Each field is unchecked by default. Copying requires explicit selection, current target/document/metadata version and permission revalidation. Edits typed after preparation are protected. Copying creates ordinary unsaved form values, emits the form's existing dirty/draft events, and does not save, link or apply a database suggestion. The normal form validation/authorization/duplicate/idempotency/conflict/recovery contract owns the later Save. No parallel record writer exists.

## Conversation privacy and extension

SSR sessions are admitted only to the matching cache owner. Account/permission lifetime and conversation epochs fence stale responses. First-prompt creation binds the returned session directly; processing is single-flight. Unconfirmed message saves stay visible and require reconciliation, never automatic reruns. Source-bound basic record history can replay; composite collection/report/policy/briefing content remains retained but withheld until a complete replay adapter can revalidate it. Fresh authorised replies still display normally. Follow-up subject binding is independent of permission to replay old prose.

`ASSISTANT_DOMAIN_COVERAGE` records supported, existing-owning-read, business-held and unsupported families. Being inventoried or having an AI configuration role never grants a business source. Future adapters must declare actual sources/fields, permissions, scope, sensitivity, counts, versions, approved rules and allow/deny/failure/recovery cases; register and test them before activation. Preserve all unresolved real mappings, official wording, stock-owner, medical, bank/WPS and statutory holds.

## Verification boundary

Tests use Node unit/integration/component simulations and a network-disabled synthetic database with captured column shapes/projection and clearly labelled owning-helper fixtures. They do not certify a browser, physical device, actual provider response, live production volume or business policy approval. Manual visual/keyboard/zoom/Android acceptance stays deferred, not passed. Stage 4 automatic upload/re-review and stage 5 quality/operations are separate.
