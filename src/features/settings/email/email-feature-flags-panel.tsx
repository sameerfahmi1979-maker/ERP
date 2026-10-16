"use client";

import { useState } from "react";
import { useProviderFlagChange } from "../use-provider-flag-change";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import type { EmailFeatureFlag } from "@/lib/email/providers/types";
import { updateEmailFeatureFlag } from "@/server/actions/settings/email-settings";

interface EmailFeatureFlagsPanelProps {
  flags: EmailFeatureFlag[];
  onRefresh: () => void;
  canManage?: boolean;
}

export function EmailFeatureFlagsPanel({ flags, onRefresh, canManage = false }: EmailFeatureFlagsPanelProps) {
  const [confirming,setConfirming]=useState<EmailFeatureFlag|null>(null);
  const operation=useProviderFlagChange(updateEmailFeatureFlag,onRefresh);

  const handleToggle = async (flag: EmailFeatureFlag) => {
    if (!canManage || operation.busy || operation.uncertain) return;
    if (flag.requiresApproval && !flag.isEnabled) {
      setConfirming(flag);return;
    }
    await operation.change(flag.featureCode,flag.workspaceRevision,{is_enabled:!flag.isEnabled});
  };

  return (
    <div className="space-y-2">
      {operation.error&&<div role="alert" className="border border-destructive p-3 text-sm">{operation.error}{operation.uncertain&&<Button className="mt-2" disabled={operation.busy||!canManage} onClick={()=>void operation.retry()}>Retry unchanged setting</Button>}</div>}
      {operation.refreshError&&<div role="alert" className="border p-3 text-sm">{operation.refreshError}<Button className="mt-2" disabled={operation.busy} onClick={operation.retryRefresh}>Refresh settings</Button></div>}
      <AlgtDialog open={!!confirming} title="Enable email feature?" onOpenChange={open=>{if(!operation.busy&&!open)setConfirming(null);}} actions={<><Button variant="outline" disabled={operation.busy} onClick={()=>setConfirming(null)}>Keep disabled</Button><Button disabled={operation.busy||!canManage||operation.uncertain} onClick={()=>{if(confirming){const flag=confirming;setConfirming(null);void operation.change(flag.featureCode,flag.workspaceRevision,{is_enabled:true});}}}>Confirm enable</Button></>}>
        <p>Enable {confirming?.featureName}? This permits email for this feature when its provider and backend delivery service are available. It does not confirm delivery.</p>
      </AlgtDialog>
      {flags.map((flag) => (
        <div key={flag.featureCode} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/20 transition-colors">
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{flag.featureName}</p>
              {flag.requiresApproval && (
                <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300">
                  <AlertTriangle className="h-2.5 w-2.5" />Requires approval
                </Badge>
              )}
            </div>
            {flag.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{flag.notes}</p>}
          </div>
          <Switch
            checked={flag.isEnabled}
            aria-label={`Enable ${flag.featureName}`}
            disabled={!canManage || operation.busy || operation.uncertain || !flag.workspaceRevision}
            onCheckedChange={() => handleToggle(flag)}
          />
        </div>
      ))}
      {flags.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No feature flags found.</p>
      )}
    </div>
  );
}
