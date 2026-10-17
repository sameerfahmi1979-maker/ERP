import { format, isValid, parseISO } from "date-fns";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DmsOcrStatusBadge } from "@/features/dms/ocr/dms-ocr-status-badge";
import type { DmsOcrJobRow } from "@/server/actions/dms/ocr";
import styles from "./recent-ocr-jobs-list.module.css";

interface RecentOcrJobsListProps {
  jobs: DmsOcrJobRow[];
  canRetry: boolean;
  retrying: boolean;
  onRetry: (jobId: number) => void;
  formatProvider: (provider: string | null) => string;
}

/** Small embedded history: no search, filter, column editor or pagination toolbar. */
export function RecentOcrJobsList({ jobs, canRetry, retrying, onRetry, formatProvider }: RecentOcrJobsListProps) {
  if (jobs.length === 0) return null;
  const showActions = canRetry && jobs.some(job => job.status === "failed");
  return <div className={`${styles.container} rounded-md border border-border overflow-hidden`}>
    <table className={styles.table} aria-label="Recent OCR jobs">
      <caption className="sr-only">Recent OCR Jobs</caption>
      <colgroup>
        <col style={{ width: "9%" }} /><col style={{ width: "18%" }} /><col style={{ width: "14%" }} />
        <col style={{ width: "10%" }} /><col style={{ width: "18%" }} />
        <col style={{ width: showActions ? "19%" : "31%" }} />
        {showActions && <col style={{ width: "12%" }} />}
      </colgroup>
      <thead><tr>
        {['Job', 'Provider', 'Status', 'Duration', 'Started', 'Error', ...(showActions ? ['Actions'] : [])].map(label =>
          <th key={label} scope="col">{label}</th>)}
      </tr></thead>
      <tbody>{jobs.map(job => {
        const started = job.started_at ? parseISO(job.started_at) : null;
        return <tr key={job.id}>
          <td data-label="Job">#{job.id}</td>
          <td data-label="Provider">{formatProvider(job.provider)}</td>
          <td data-label="Status"><DmsOcrStatusBadge status={job.status === "completed" ? "complete" : job.status} /></td>
          <td data-label="Duration">{job.duration_ms != null ? `${(job.duration_ms / 1000).toFixed(1)}s` : "—"}</td>
          <td data-label="Started">{started && isValid(started) ? format(started, "dd MMM HH:mm") : "—"}</td>
          <td data-label="Error" className={styles.error}>{job.error_message || "—"}</td>
          {showActions && <td data-label="Actions">{job.status === "failed" && <Button type="button" size="sm" variant="ghost"
            className="h-auto min-h-7 max-w-full whitespace-normal px-1.5 text-xs gap-1" disabled={retrying}
            onClick={() => onRetry(job.id)} title={`Retry OCR job #${job.id}`}>
            <RotateCcw className="h-3 w-3 shrink-0" />Retry
          </Button>}</td>}
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
