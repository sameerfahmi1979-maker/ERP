"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Brain,
  ShieldCheck,
  ToggleLeft,
  BarChart3,
  Plus,
} from "lucide-react";
import type { AiProviderConfig, AiFeatureFlag } from "@/lib/ai/providers/types";
import { AiProviderConfigList } from "./ai-provider-config-list";
import { AiFeatureFlagsPanel } from "./ai-feature-flags-panel";
import { AiUsageLogTable } from "./ai-usage-log-table";
import { AiProviderFormDialog } from "./ai-provider-form-dialog";

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

interface AiSettingsPageClientProps {
  configs: AiProviderConfig[];
  featureFlags: AiFeatureFlag[];
  usageLogs: UsageLogRow[];
}

export function AiSettingsPageClient({
  configs,
  featureFlags,
  usageLogs,
}: AiSettingsPageClientProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [, startTransition] = useTransition();

  const enabledCount = configs.filter((c) => c.isEnabled).length;
  const testedCount = configs.filter((c) => c.lastTestStatus === "success").length;
  const enabledFlagsCount = featureFlags.filter((f) => f.isEnabled).length;

  void startTransition;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-500/10">
            <Brain className="h-6 w-6 text-violet-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure ERP-wide AI providers, OCR providers, models, confidence thresholds, and secure API access.
            </p>
          </div>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Provider
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Configured Providers"
          value={configs.length}
          description="Total AI provider configurations"
          colorClass="text-violet-500"
          icon={Brain}
        />
        <SummaryCard
          title="Enabled Providers"
          value={enabledCount}
          description="Active and ready for use"
          colorClass="text-green-500"
          icon={ShieldCheck}
        />
        <SummaryCard
          title="Tested Successfully"
          value={testedCount}
          description="Last connection test passed"
          colorClass="text-blue-500"
          icon={ShieldCheck}
        />
        <SummaryCard
          title="Active AI Features"
          value={enabledFlagsCount}
          description={`of ${featureFlags.length} features enabled`}
          colorClass="text-amber-500"
          icon={ToggleLeft}
        />
      </div>

      {/* Security notice */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <span className="font-semibold">Security: </span>
            API keys are never stored in the database. Only a masked preview is shown after saving.
            Keys are resolved from environment variables at runtime (server-side only).
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="providers" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:grid-cols-none lg:flex">
          <TabsTrigger value="providers" className="gap-2">
            <Brain className="h-4 w-4" />
            Providers
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-2">
            <ToggleLeft className="h-4 w-4" />
            Feature Flags
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Usage Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="mt-4">
          <AiProviderConfigList configs={configs} onAdd={() => setAddOpen(true)} />
        </TabsContent>

        <TabsContent value="features" className="mt-4">
          <AiFeatureFlagsPanel flags={featureFlags} />
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          <AiUsageLogTable logs={usageLogs} />
        </TabsContent>
      </Tabs>

      {addOpen && (
        <AiProviderFormDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            toast.success("Provider configuration saved");
            setAddOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
  colorClass,
  icon: Icon,
}: {
  title: string;
  value: number;
  description: string;
  colorClass: string;
  icon: React.FC<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className={`mt-1 text-3xl font-bold ${colorClass}`}>{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <Icon className={`h-5 w-5 ${colorClass} opacity-60`} />
        </div>
      </CardContent>
    </Card>
  );
}
