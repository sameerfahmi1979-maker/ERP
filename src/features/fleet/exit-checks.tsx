
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { FleetExitScope, FleetExitTask } from "@/lib/fleet/custody-contract";

const returnDate = new Intl.DateTimeFormat("en-AE", {
  timeZone: "Asia/Dubai", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function FleetExitChecks({ scopes, branch, query, page, tasks }: {
  scopes: FleetExitScope[] | null;
  branch: number | undefined;
  query: string;
  page: number;
  tasks: FleetExitTask[] | null;
}) {
  if (scopes?.length === 0) return null;
  return <section id="exit-return-checks" aria-labelledby="exit-return-heading" className="space-y-3 rounded-lg border bg-card p-4">
    <h2 id="exit-return-heading" className="font-semibold">Exit return checks</h2>
    {scopes === null ? <p role="alert" className="text-sm">Operating branches could not be loaded. Reload to try again.</p> : <>
      <form action="/modules/fleet#exit-return-checks" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="q" value={query} />
        <input type="hidden" name="page" value={page} />
        <label className="grid gap-1.5 text-sm">
          Operating branch
          <select name="exitBranch" defaultValue={branch ?? ""} required
            className="h-9 max-w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring">
            <option value="" disabled>Choose a branch</option>
            {scopes.map(scope => <option key={scope.branch} value={scope.branch}>{scope.label}</option>)}
          </select>
        </label>
        <Button type="submit" variant="outline">Load branch</Button>
      </form>
      {branch === undefined ? <p className="text-sm text-muted-foreground">Choose an assigned branch to see its return checks.</p> :
        tasks === null ? <p role="alert" className="text-sm">Return checks could not be loaded. Load this branch again.</p> :
          tasks.length === 0 ? <p className="text-sm text-muted-foreground">No exit returns due for this branch.</p> :
            <ul className="divide-y rounded-md border px-3 text-sm">
              {tasks.map(task => <li key={task.eos_id + ":" + task.commitment_id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <div>
                  <p className="font-medium">{task.asset_title}</p>
                  <p className="text-muted-foreground">Planned return <time dateTime={task.planned_return}>
                    {returnDate.format(new Date(task.planned_return))}
                  </time></p>
                </div>
                {task.owning_operation !== null ?
                  <Link href={"/modules/fleet/operations/" + task.owning_operation}
                    className="font-medium text-primary hover:underline">Open owning operation</Link> :
                  task.managed_by_operation ? <span className="text-muted-foreground">Return handled by Operations</span> :
                    <Link href={"/modules/fleet/" + task.asset_id + "#custody"}
                      className="font-medium text-primary hover:underline">Open custody return</Link>}
              </li>)}
            </ul>}
    </>}
  </section>;
}
