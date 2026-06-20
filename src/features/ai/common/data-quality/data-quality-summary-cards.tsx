'use client';

import type { DataQualitySummary } from '@/lib/ai/common/data-quality/types';
import { AlertTriangle, CheckCircle, Info, ShieldAlert, Flame } from 'lucide-react';

interface Props {
  summary: DataQualitySummary;
}

export function DataQualitySummaryCards({ summary }: Props) {
  const cards = [
    {
      label: 'Open Findings',
      value: summary.total_open,
      icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
      bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
    },
    {
      label: 'Reviewed',
      value: summary.total_reviewed,
      icon: <CheckCircle className="h-5 w-5 text-blue-500" />,
      bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
    },
    {
      label: 'Critical',
      value: summary.total_by_severity.critical ?? 0,
      icon: <Flame className="h-5 w-5 text-red-600" />,
      bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
    },
    {
      label: 'High',
      value: summary.total_by_severity.high ?? 0,
      icon: <ShieldAlert className="h-5 w-5 text-orange-500" />,
      bg: 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800',
    },
    {
      label: 'Medium',
      value: summary.total_by_severity.medium ?? 0,
      icon: <Info className="h-5 w-5 text-yellow-500" />,
      bg: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-lg border p-4 ${card.bg}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{card.label}</span>
            {card.icon}
          </div>
          <div className="mt-2 text-2xl font-bold">{card.value}</div>
        </div>
      ))}
    </div>
  );
}
