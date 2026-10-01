'use client';
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";

import type { DataQualityFinding } from '@/lib/ai/common/data-quality/types';
import { DataQualitySeverityBadge } from './data-quality-severity-badge';
import { DataQualityStatusBadge } from './data-quality-status-badge';

interface Props {
  findings: DataQualityFinding[];
  selectedId?: number | null;
  onSelect: (finding: DataQualityFinding) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  completeness: 'Completeness',
  format: 'Format',
  consistency: 'Consistency',
  staleness: 'Staleness',
  relationship: 'Relationship',
  dms_health: 'DMS Health',
  ai_health: 'AI Health',
  permission_health: 'Permission Health',
};

export function DataQualityFindingsTable({ findings, selectedId, onSelect }: Props) {
  if (findings.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
        No findings match the current filters.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        {/* UI05 explicit table: authorized loaded rows, original permission-aware actions */}<ERPDataTable tableId="special.ai.common.data-quality.data-quality-findings-table" data={findings} columns={[{id:"severity",header:"Severity",accessorFn:finding=>loadedListValue(finding,"severity"),meta:{filter:{type:"text"}},enableHiding:false,size:220,cell:({row:{original:finding}})=>{
return <><DataQualitySeverityBadge severity={finding.severity} /></>;}},{id:"title",header:"Title",accessorFn:finding=>loadedListValue(finding,"title"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:finding}})=>{
return <><button type="button" aria-pressed={selectedId === finding.id} className="text-left underline underline-offset-2 focus-visible:outline-2" onClick={()=>onSelect(finding)}><span className="font-medium text-foreground line-clamp-1">{finding.title}</span><span className="block text-xs text-muted-foreground font-mono">{finding.rule_code}</span></button></>;}},{id:"rule_category",header:"Category",accessorFn:finding=>loadedListValue(finding,"rule_category"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:finding}})=>{
return <>{CATEGORY_LABELS[finding.rule_category] ?? finding.rule_category}</>;}},{id:"entity_type",header:"Entity type",accessorFn:finding=>loadedListValue(finding,"entity_type"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:finding}})=>{
return <>{finding.entity_type.replace('_', ' ')}</>;}},{id:"status",header:"Status",accessorFn:finding=>loadedListValue(finding,"status"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:finding}})=>{
return <><DataQualityStatusBadge status={finding.status} /></>;}},{id:"detected_at",header:"Detected",accessorFn:finding=>loadedListValue(finding,"detected_at"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:finding}})=>{
return <>{new Date(finding.detected_at).toLocaleDateString()}</>;}}]} enableRowSelection={false} searchPlaceholder="Search loaded records…" initialPageSize={10} />
      </div>
    </div>
  );
}
