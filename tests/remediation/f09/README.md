# Deferred F09 test reference

The owner requested an F05 release without the incompatible F09 delivery cutover on 1 October 2026. These test sources are retained as a reference, **not an executable or passing suite on the F05-only release branch**. Their worker implementation and five migrations are deliberately absent here. The active CI suite tests the released F05 contract and guards the unchanged production delivery paths.

The complete matched implementation, tests, migrations and F05-adapted queue/schedule screens are preserved at `6b47aeb1bdb587f3b5503d2ad5407e30cd462a3c` on `codex/f05-fluent-ui`. Resume F09 after F08 by restoring/reconciling that matched source set, including the 12 deferred F05 action/form cases from `ui03-actions.test.ts` and `ui03-forms.test.tsx`, and rerunning all F09 tests and cutover gates. A plain merge of the older branch will not restore files removed by a later deferral commit.

Do not run the database/worker helper scripts against production or enable the old/new consumers together. This deferral is not a claim that existing delivery defects are fixed.
