# Inbox counted-read authority optimization

This additive candidate groups the complete nullable `(uploaded_by, owning_company_id, owning_branch_id, document_id)` tuple, evaluates the unchanged F03 upload point authority once per distinct tuple, and joins authorized tuples back to upload IDs. No authorization decision is persisted or cached across statements. Linked-document checks remain in the original helper. No client-provided company scope becomes authorization.

The private function requires a valid business principal and explicit authenticated execution. Public/anonymous/service-role execution is revoked. The SELECT restriction uses the statement-local ID set; the original restrictive INSERT/UPDATE/DELETE expressions and restrictive principal policy remain intact. Historical migrations are not edited. The V5 source manifest appends entry132 to the immutable131 dependency prefix; it is not an application receipt or a timestamp-sorted production push instruction.

## Recorded verification boundary

- One rollback-only ordinary-authenticated differential returned identical row IDs before and after the policy change. Native page query: 2322.556 ms before / 20.224 ms after on the retained synthetic laboratory workload.
- Sixteen further rollback-only scope/principal differentials passed against the original point helper, including company/branch review, independent combined assignments, unrelated global numbering, role revocation/restoration, disabled role, inactive account, mandatory password change, expired session and banned Auth user. Counted native query:33.225 ms. These are selected database measurements, not browser timings, production-volume guarantees or native SDK acceptance.
- Original test-fixture failures remain recorded: the first combined-scope expectation incorrectly used a numbering-only assignment; a later fixture attempted a lifecycle change while carrying authenticated claims and was correctly refused by the existing F03 guard. The accepted successor separates privileged rollback-only fixture preparation from actual authenticated read execution. No lifecycle guard was removed or relaxed.
- Independent cleanup confirmed all temporary Auth users/profiles/roles/grants/sessions absent, refresh tokens/email queue/provider activations zero, all1009 original upload rows retained, and schema131 unchanged. The profile identity sequence advanced through58; it was not reset.
- Three source-contract regressions pass. Fresh committed132 application/replay/catalog qualification and ordinary SDK acceptance remain release gates. Rollback evidence must not be relabelled as those passes.

## Associated UI repair

Party Audit now suppresses stale history after a failed refresh, uses a generic accessible error and offers retry without exposing raw server/database messages. The new actual-component regressions reproduced two failures before repair; all six pass afterward, covering populated/empty/loading/denied/error states. No visual/device or child-audit expansion is claimed.

The newer deployed OCR projection fix is integrated separately with three-way conflict resolution retaining PERF's cancellation-aware read transport. All four OCR commits and existing F03/F04/F05/F06 controls must survive release. This document does not close the remaining workflow, release or owner-acceptance gates.
