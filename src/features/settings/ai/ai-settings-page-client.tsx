"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { OperationStatus } from "@/components/erp/operation-status";
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
import {AiQualityPanel} from '@/features/ai/quality/ai-quality-panel';

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
  permissions: { canViewProviders: boolean; canViewFlags: boolean; canManage: boolean; canManageSecrets: boolean; canTest: boolean; canViewUsage: boolean };
  configs: AiProviderConfig[];
  featureFlags: AiFeatureFlag[];
  usageLogs: UsageLogRow[];
  activePanel?: string;
  failedPanels?: { providers: boolean; flags: boolean; logs: boolean };
}

export function AiSettingsPageClient({
  configs,
  featureFlags,
  usageLogs,
  failedPanels = { providers: false, flags: false, logs: false },
  permissions,
  activePanel = permissions.canViewProviders ? "providers" : permissions.canViewFlags ? "flags" : "logs",
}: AiSettingsPageClientProps) {
  const [addOpen, setAddOpen] = useState(false);
  const router = useRouter();
  const [navigationPending, startNavigation] = useTransition();

  const enabledCount = configs.filter((c) => c.isActive && c.isEnabled).length;
  const testedCount = configs.filter((c) => c.lastTestStatus === "success").length;
  const enabledFlagsCount = featureFlags.filter((f) => f.isEnabled).length;


  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        {permissions.canManage && <Button disabled={failedPanels.providers} onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Provider
        </Button>}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Configured Providers"
          value={failedPanels.providers ? "Unavailable" : permissions.canViewProviders ? configs.length : "Restricted"}
          description="Total AI provider configurations"
          colorClass="text-violet-500"
          icon={Brain}
        />
        <SummaryCard
          title="Enabled Providers"
          value={failedPanels.providers ? "Unavailable" : permissions.canViewProviders ? enabledCount : "Restricted"}
          description="Enabled configuration; operation readiness is not verified"
          colorClass="text-green-500"
          icon={ShieldCheck}
        />
        <SummaryCard
          title="Tested Successfully"
          value={failedPanels.providers ? "Unavailable" : permissions.canViewProviders ? testedCount : "Restricted"}
          description="Last connection check passed; not end-to-end acceptance"
          colorClass="text-blue-500"
          icon={ShieldCheck}
        />
        <SummaryCard
          title="Active AI Features"
          value={failedPanels.flags ? "Unavailable" : permissions.canViewFlags ? enabledFlagsCount : "Restricted"}
          description={failedPanels.flags ? "Feature configuration could not be loaded" : permissions.canViewFlags ? `of ${featureFlags.length} features enabled` : "Feature configuration is outside your permission"}
          colorClass="text-amber-500"
          icon={ToggleLeft}
        />
      </div>

      {navigationPending && <OperationStatus state="pending">Loading AI settings panel…</OperationStatus>}
      <Tabs value={activePanel} className="w-full" onValueChange={panel => {
        if (typeof panel !== "string" || panel === activePanel) return;
        startNavigation(() => router.replace(`/admin/settings/ai?panel=${encodeURIComponent(panel)}`, { scroll: false }));
      }}>
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:grid-cols-none lg:flex">
          {permissions.canViewProviders && <TabsTrigger value="providers" className="gap-2">
            <Brain className="h-4 w-4" />
            Providers
          </TabsTrigger>}
          {permissions.canViewFlags && <TabsTrigger value="flags" className="gap-2">
            <ToggleLeft className="h-4 w-4" />
            Feature Flags
          </TabsTrigger>}
          {permissions.canViewUsage && <TabsTrigger value="logs" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Usage Logs
          </TabsTrigger>}
          <TabsTrigger value="quality">Quality and operations</TabsTrigger>
        </TabsList>

        {permissions.canViewProviders && <TabsContent value="providers" className="mt-4">
          {failedPanels.providers
            ? <OperationStatus state="failed" retry={() => router.refresh()}>AI providers could not be loaded.</OperationStatus>
            : <AiProviderConfigList configs={configs} onAdd={() => setAddOpen(true)} {...permissions} />}
        </TabsContent>}

        {permissions.canViewFlags && <TabsContent value="flags" className="mt-4">
          {failedPanels.flags
            ? <OperationStatus state="failed" retry={() => router.refresh()}>AI feature flags could not be loaded.</OperationStatus>
            : <AiFeatureFlagsPanel flags={featureFlags} canManage={permissions.canManage} />}
        </TabsContent>}

        <TabsContent value="logs" className="mt-4">
          {permissions.canViewUsage && (failedPanels.logs
            ? <OperationStatus state="failed" retry={() => router.refresh()}>AI usage logs could not be loaded.</OperationStatus>
            : <AiUsageLogTable logs={usageLogs} />)}
        </TabsContent>
        <TabsContent value="quality" className="mt-4"><AiQualityPanel/></TabsContent>
      </Tabs>

      {addOpen && permissions.canManage && !failedPanels.providers && (
        <AiProviderFormDialog
          open={addOpen}
          canManageSecrets={permissions.canManageSecrets}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            toast.success("Provider configuration saved");
            setAddOpen(false);
            router.refresh();
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
  value: number | string;
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
