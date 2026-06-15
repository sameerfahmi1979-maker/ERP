"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, XCircle, BarChart3 } from "lucide-react";
import { format } from "date-fns";

type UsageLogRow = {
  id: number;
  featureArea: string;
  operationType: string;
  modelId: string | null;
  status: string;
  durationMs: number | null;
  estimatedCost: number | null;
  errorMessage: string | null;
  createdAt: string;
  providerName?: string | null;
};

interface AiUsageLogTableProps {
  logs: UsageLogRow[];
}

export function AiUsageLogTable({ logs }: AiUsageLogTableProps) {
  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <BarChart3 className="h-8 w-8 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No usage logs yet.</p>
          <p className="text-xs text-muted-foreground">
            Logs will appear here after running test connections or using AI features.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Time</TableHead>
                <TableHead className="text-xs">Provider</TableHead>
                <TableHead className="text-xs">Area</TableHead>
                <TableHead className="text-xs">Operation</TableHead>
                <TableHead className="text-xs">Model</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Duration</TableHead>
                <TableHead className="text-xs text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(log.createdAt), "dd MMM HH:mm")}
                  </TableCell>
                  <TableCell className="text-xs">
                    {log.providerName ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-xs font-normal">
                      {log.featureArea}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{log.operationType}</TableCell>
                  <TableCell className="text-xs font-mono">
                    {log.modelId ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {log.status === "success" ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Success
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <XCircle className="h-3.5 w-3.5" />
                        {log.status}
                        {log.errorMessage && (
                          <span className="text-muted-foreground ml-1 truncate max-w-[150px]" title={log.errorMessage}>
                            — {log.errorMessage.substring(0, 40)}
                          </span>
                        )}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-right text-muted-foreground">
                    {log.durationMs != null ? `${log.durationMs}ms` : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-right text-muted-foreground">
                    {log.estimatedCost != null ? `$${log.estimatedCost.toFixed(6)}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
