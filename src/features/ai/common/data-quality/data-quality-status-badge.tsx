'use client';

import { cn } from '@/lib/utils';
import type { DataQualityStatus } from '@/lib/ai/common/data-quality/types';

interface Props {
  status: DataQualityStatus;
  className?: string;
}

const STATUS_CONFIG: Record<DataQualityStatus, { label: string; className: string }> = {
  open:          { label: 'Open',           className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  reviewed:      { label: 'Reviewed',       className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  dismissed:     { label: 'Dismissed',      className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  resolved:      { label: 'Resolved',       className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  false_positive:{ label: 'False Positive', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  superseded:    { label: 'Superseded',     className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500' },
};

export function DataQualityStatusBadge({ status, className }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
