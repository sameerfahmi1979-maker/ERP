import { Button } from "@/components/ui/button";

export function PayrollRefreshNotice({ busy, retry }: { busy: boolean; retry: () => void }) {
  return <div className="space-y-2">
    <p role="alert" className="text-sm text-destructive">
      Saved. The workspace could not be refreshed.
    </p>
    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={retry}>
      {busy ? "Refreshing…" : "Retry refreshing"}
    </Button>
  </div>;
}
