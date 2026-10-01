import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";

// Explicit owner decision: release F05 without the F09 delivery cutover.
// These existing-production paths are NOT claimed fixed by the UI release.
// Retire this guard only as part of the coordinated F09 release after F08.
const baseline = {
  "src/app/api/internal/process-email-queue/route.ts": "911cba5071fcd2334c4fe00a8392479de7f707546c8ff8d4cf6af12a10a1238f",
  "src/app/api/internal/report-schedules/process/route.ts": "4adf25bc39357260b774b51eb57ab2936cd96f7691f49903619313952b6746d3",
  "src/server/actions/notifications/email-queue.ts": "0d49a65b6ec9bd84cc9939f07009e31ce50ac9c9b57fa65d32a348b7465015a9",
  "src/server/actions/notifications/bridges/dms-notification-bridge.ts": "916307c2ed08b6710b6d380548bf2085795af6ad4c089bca2c3621e7c5253241",
  "src/server/actions/reports/schedules.ts": "bff9437ed61e729c4bb4aa8a526f947d950a42bf8991357871e4e7f8c43696f7",
  "src/lib/report-center/schedule-worker.ts": "30eee137133c3b4afb7c5143962c5f16152bab0b55fc9daf38d2abd34122547b",
  "src/lib/report-center/schedule-worker-core.ts": "9325e78e527191eb0611eebd8673ecd91c05a5761e2f51914c3afef205069d69",
  "src/lib/report-center/schedule-execution.ts": "1cd8e1559fc9cd80b71da6ec2474821e673144faf9df93d00e913fc54ebcfefd",
  "supabase/functions/dms-expiry-scheduler/index.ts": "21bf0a1d76c9a3203c091b3ea1d32d1ce58f43193ad0752c087593325f26f647"
};
it.each(Object.entries(baseline))("retains the released delivery implementation: %s", (path, hash) => {
  expect(createHash("sha256").update(readFileSync(path, "utf8").replaceAll("\r\n", "\n")).digest("hex")).toBe(hash);
});
it("cannot accidentally apply F09 migrations with the F05 release", () => {
  expect(readdirSync("supabase/migrations").filter(p => /_f09_/.test(p))).toEqual([]);
  expect(existsSync("src/lib/email/queue/service.ts")).toBe(false);
});
it("retains the two independently owned F05 DMS migrations", () => {
  expect(readdirSync("supabase/migrations").filter(p => /_f05_/.test(p))).toEqual([
    "20260930164345_f05_dms_workflow_atomic_configuration.sql",
    "20260930175323_f05_dms_atomic_approval_steps.sql",
  ]);
});
