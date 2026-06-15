"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import type { EmailFeatureFlag } from "@/lib/email/providers/types";
import { updateEmailFeatureFlag } from "@/server/actions/settings/email-settings";

interface EmailFeatureFlagsPanelProps {
  flags: EmailFeatureFlag[];
  onRefresh: () => void;
}

export function EmailFeatureFlagsPanel({ flags, onRefresh }: EmailFeatureFlagsPanelProps) {
  const [updating, setUpdating] = useState<string | null>(null);

  const handleToggle = async (flag: EmailFeatureFlag) => {
    if (flag.requiresApproval && !flag.isEnabled) {
      if (!confirm(`Enable "${flag.featureName}"? This will allow emails to be sent for this feature.`)) return;
    }
    setUpdating(flag.featureCode);
    try {
      const result = await updateEmailFeatureFlag(flag.featureCode, { is_enabled: !flag.isEnabled });
      if (result.success) {
        toast.success(`${flag.featureName} ${flag.isEnabled ? "disabled" : "enabled"}`);
        onRefresh();
      } else {
        toast.error(result.error ?? "Failed");
      }
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-2">
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
            disabled={updating === flag.featureCode}
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
