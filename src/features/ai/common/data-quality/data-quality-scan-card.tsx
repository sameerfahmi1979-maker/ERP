'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScanLine, Loader2 } from 'lucide-react';
import type { DataQualityScanResult } from '@/lib/ai/common/data-quality/types';
import { runDataQualityScan } from '@/server/actions/ai/common/data-quality';

interface Props {
  canScan: boolean;
  onScanComplete?: () => void;
}

export function DataQualityScanCard({ canScan, onScanComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<DataQualityScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    setLoading(true);
    setResult(null);
    setError(null);

    const { data, error: err } = await runDataQualityScan({
      scope: 'existing_scope',
      dryRun,
    });

    setLoading(false);

    if (err) {
      setError(err);
      return;
    }

    setResult(data);
    if (!dryRun) {
      onScanComplete?.();
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-primary" />
            Data Quality Scan
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Runs deterministic rule-based checks across existing ERP scope. No source records are modified.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="rounded border"
            />
            Dry Run
          </label>
          <Button
            size="sm"
            onClick={handleScan}
            disabled={loading || !canScan}
            className="gap-1.5"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Scanning…
              </>
            ) : (
              <>
                <ScanLine className="h-3.5 w-3.5" />
                {dryRun ? 'Dry Run' : 'Run Scan'}
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-md bg-muted p-3 text-xs space-y-1">
          <div className="font-medium text-sm">
            {result.dry_run ? 'Dry Run Results' : 'Scan Complete'}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            <span>Findings detected: <span className="font-medium text-foreground">{result.total_findings_detected}</span></span>
            <span>New: <span className="font-medium text-foreground">{result.new_findings}</span></span>
            <span>Reopened: <span className="font-medium text-foreground">{result.reopened_findings}</span></span>
            <span>Resolved: <span className="font-medium text-foreground">{result.resolved_findings}</span></span>
            <span>Duration: <span className="font-medium text-foreground">{result.duration_ms}ms</span></span>
          </div>
        </div>
      )}
    </div>
  );
}
