"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ToggleLeft } from "lucide-react";
import type { AiFeatureFlag } from "@/lib/ai/providers/types";
import { updateAiFeatureFlag } from "@/server/actions/settings/ai-settings";

interface AiFeatureFlagsPanelProps {
  flags: AiFeatureFlag[];
}

export function AiFeatureFlagsPanel({ flags }: AiFeatureFlagsPanelProps) {
  const [updating, setUpdating] = useState<string | null>(null);

  const handleToggle = async (flag: AiFeatureFlag, enabled: boolean) => {
    setUpdating(flag.featureCode);
    try {
      const result = await updateAiFeatureFlag(flag.featureCode, { is_enabled: enabled });
      if (result.success) {
        toast.success(
          enabled
            ? `${flag.featureName} enabled`
            : `${flag.featureName} disabled`
        );
      } else {
        toast.error(result.error ?? "Failed to update feature flag");
      }
    } finally {
      setUpdating(null);
    }
  };

  const handleReviewToggle = async (flag: AiFeatureFlag, requiresReview: boolean) => {
    if (!requiresReview && !confirm(
      `Disabling human review for "${flag.featureName}" means AI results will be auto-accepted. Are you sure?`
    )) return;

    setUpdating(flag.featureCode);
    try {
      const result = await updateAiFeatureFlag(flag.featureCode, {
        requires_human_review: requiresReview,
      });
      if (result.success) {
        toast.success(`Human review ${requiresReview ? "enabled" : "disabled"} for ${flag.featureName}`);
      } else {
        toast.error(result.error ?? "Failed to update");
      }
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-4">
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
        {flags.map((flag) => {
          const isUpdating = updating === flag.featureCode;
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
                      disabled={isUpdating}
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
        })}
      </div>
    </div>
  );
}
