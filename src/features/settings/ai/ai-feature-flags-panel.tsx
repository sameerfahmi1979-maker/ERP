"use client";
import { RecordCollection } from "@/components/erp/table/record-collection";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProviderFlagChange } from "../use-provider-flag-change";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ToggleLeft } from "lucide-react";
import type { AiFeatureFlag } from "@/lib/ai/providers/types";
import { updateAiFeatureFlag } from "@/server/actions/settings/ai-settings";

interface AiFeatureFlagsPanelProps {
  canManage?: boolean;
  flags: AiFeatureFlag[];
}

export function AiFeatureFlagsPanel({ flags, canManage=false }: AiFeatureFlagsPanelProps) {
  const router = useRouter();
  const operation=useProviderFlagChange(updateAiFeatureFlag,()=>router.refresh());
  const [confirming,setConfirming]=useState<AiFeatureFlag|null>(null);
  const handleToggle = async (flag:AiFeatureFlag,enabled:boolean) => {
    if(!canManage||operation.busy||operation.uncertain)return;
    await operation.change(flag.featureCode,flag.workspaceRevision,{is_enabled:enabled});
  };
  const handleReviewToggle = async (flag:AiFeatureFlag,required:boolean) => {
    if(!canManage||operation.busy||operation.uncertain||flag.featureCode.startsWith("DMS_"))return;
    if(!required){setConfirming(flag);return;}
    await operation.change(flag.featureCode,flag.workspaceRevision,{requires_human_review:true});
  };

  return (
    <div className="space-y-4">
      {operation.error&&<div role="alert" className="border border-destructive p-3 text-sm">{operation.error}{operation.uncertain&&<Button className="mt-2" disabled={operation.busy||!canManage} onClick={()=>void operation.retry()}>Retry unchanged setting</Button>}</div>}
      {operation.refreshError&&<div role="alert" className="border p-3 text-sm">{operation.refreshError}<Button className="mt-2" disabled={operation.busy} onClick={operation.retryRefresh}>Refresh settings</Button></div>}
      <AlgtDialog open={!!confirming} title="Remove human review?" onOpenChange={open=>{if(!operation.busy&&!open)setConfirming(null);}} actions={<><Button variant="outline" disabled={operation.busy} onClick={()=>setConfirming(null)}>Keep review</Button><Button disabled={operation.busy||!canManage||operation.uncertain} onClick={()=>{if(confirming){const flag=confirming;setConfirming(null);void operation.change(flag.featureCode,flag.workspaceRevision,{requires_human_review:false});}}}>Confirm removal</Button></>}>
        <p>Remove the human-review requirement for {confirming?.featureName}? Supported consumers may accept AI results without a reviewer. DMS review cannot be removed here.</p>
      </AlgtDialog>
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20 p-3">
        <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            All AI features default to <strong>disabled</strong>. Enable only after configuring the
            corresponding provider and confirming with Sameer.
            <strong> Human review must remain enabled for all DMS features</strong> until auto-save is approved.
          </span>
        </div>
      </div>

      <div className="grid gap-3">
        {<RecordCollection id="special.ai-feature-flags-panel" rows={flags} fields={[{"id":"featureCode","path":"featureCode","label":"Feature"},{"id":"featureName","path":"featureName","label":"Name"},{"id":"isEnabled","path":"isEnabled","label":"Enabled"}]} renderRecord={(flag) => {
          const isUpdating = !canManage || operation.busy || operation.uncertain || !flag.workspaceRevision;
          return (
            <Card key={flag.featureCode}>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ToggleLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-sm font-medium">{flag.featureName}</CardTitle>
                      {flag.description && !flag.description.includes("Purpose: DMS document OCR") && (
                        <CardDescription className="text-xs mt-0.5">{flag.description}</CardDescription>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="outline" className="font-mono text-xs">
                      {flag.featureCode}
                    </Badge>
                    <Switch
                      checked={flag.isEnabled}
                      onCheckedChange={(v) => handleToggle(flag, v)}
                      disabled={isUpdating}
                      aria-label={`Toggle ${flag.featureName}`}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-3 pt-0">
                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>Human review:</span>
                    <Switch
                      checked={flag.requiresHumanReview}
                      onCheckedChange={(v) => handleReviewToggle(flag, v)}
                      disabled={isUpdating || flag.featureCode.startsWith("DMS_")}
                      className="h-4 w-7 data-[state=checked]:bg-amber-500"
                      aria-label={`Human review for ${flag.featureName}`}
                    />
                    <span className={flag.requiresHumanReview ? "text-amber-600 font-medium" : "text-green-600"}>
                      {flag.requiresHumanReview ? "Required" : "Auto-accept"}
                    </span>
                  </div>
                  <div>
                    Min confidence:{" "}
                    <span className="font-medium text-foreground">
                      {(flag.minConfidenceThreshold * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Badge
                    variant={flag.isEnabled ? "default" : "secondary"}
                    className={`text-xs ${flag.isEnabled ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300" : ""}`}
                  >
                    {flag.isEnabled ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        }} />}
      </div>
    </div>
  );
}
