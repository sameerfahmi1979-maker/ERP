'use client';

import { cn } from '@/lib/utils';
import type { DataQualitySeverity } from '@/lib/ai/common/data-quality/types';

interface Props {
  severity: DataQualitySeverity;
  className?: string;
}

const SEVERITY_CONFIG: Record<DataQualitySeverity, { label: string; className: string }> = {
  info:     { label: 'Info',     className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  low:      { label: 'Low',      className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  medium:   { label: 'Medium',   className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  high:     { label: 'High',     className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  critical: { label: 'Critical', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

export function DataQualitySeverityBadge({ severity, className }: Props) {
  const config = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.medium;
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
