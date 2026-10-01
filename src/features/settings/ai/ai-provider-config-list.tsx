"use client";
import { RecordCollection } from "@/components/erp/table/record-collection";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Wifi,
  WifiOff,
  Key,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
} from "lucide-react";
import type { AiProviderConfig } from "@/lib/ai/providers/types";
import {
  deleteAiProviderConfig,
  testAiProviderConnection,
} from "@/server/actions/settings/ai-settings";
import { AiProviderFormDialog } from "./ai-provider-form-dialog";
import { AiProviderSecretDialog } from "./ai-provider-secret-dialog";

const PURPOSE_LABELS: Record<string, string> = {
  general: "General",
  chat: "Chat",
  ocr: "OCR",
  classification: "Classification",
  extraction: "Extraction",
  embedding: "Embedding",
  dms: "DMS",
  assistant: "Assistant",
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  azure_openai: "Azure OpenAI",
  azure_document_intelligence: "Azure Doc Intelligence",
  google_document_ai: "Google Document AI",
  aws_textract: "AWS Textract",
  tesseract: "Tesseract (Local)",
  local_ollama: "Ollama (Local)",
  local_custom: "Custom Local",
};

interface AiProviderConfigListProps {
  canManage?: boolean;
  canManageSecrets?: boolean;
  canTest?: boolean;
  configs: AiProviderConfig[];
  onAdd: () => void;
}

export function AiProviderConfigList({ configs, onAdd, canManage=false, canManageSecrets=false, canTest=false }: AiProviderConfigListProps) {
  const [editTarget, setEditTarget] = useState<AiProviderConfig | null>(null);
  const [secretTarget, setSecretTarget] = useState<AiProviderConfig | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; message: string }>>({});
  const flight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);

  const handleDelete = async (config: AiProviderConfig) => {
    if (!canManage || flight.current || uncertain) return;
    if (!confirm(`Delete provider "${config.providerName}"? This cannot be undone.`)) return;
    flight.current = true;
    setBusy(true);
    try {
      const result = await deleteAiProviderConfig(config.id);
      if (result.success) toast.success("Provider deleted");
      else toast.error("Provider deletion was not accepted. Refresh and check your permissions.");
    } catch {
      setUncertain(true);
    } finally { flight.current = false; setBusy(false); }
  };

  const handleTest = async (config: AiProviderConfig) => {
    if (!canTest || flight.current || uncertain) return;
    flight.current = true;
    setBusy(true);
    setTestingId(config.id);
    try {
      const result = await testAiProviderConnection(config.id);
      if (result.success && result.data) {
        const message = result.data.ok ? "Connection succeeded" : "Connection failed. Review the provider configuration.";
        setTestResults((prev) => ({ ...prev, [config.id]: { ok: result.data!.ok, message } }));
        if (result.data.ok) {
          toast.success(message);
        } else {
          toast.error(message);
        }
      } else {
        toast.error("The connection test was not accepted.");
      }
    } catch {
      setUncertain(true);
    } finally {
      flight.current = false;
      setBusy(false);
      setTestingId(null);
    }
  };

  if (configs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <Zap className="h-8 w-8 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No AI provider configurations yet.</p>
          {canManage && <Button onClick={onAdd} variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add First Provider
          </Button>}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {uncertain && <div role="alert" className="border border-destructive p-3 text-sm">The operation could not be confirmed. Reload and check the provider status before trying again.</div>}
      <div className="grid gap-4">
        {<RecordCollection id="special.ai-provider-config-list" rows={configs} fields={[{"id":"providerName","path":"providerName","label":"Provider"},{"id":"configCode","path":"configCode","label":"Code"},{"id":"providerType","path":"providerType","label":"Type"},{"id":"purpose","path":"purpose","label":"Purpose"}]} renderRecord={(config) => {
          const liveResult = testResults[config.id];
          const isTestingThis = testingId === config.id;

          return (
            <Card key={config.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{config.providerName}</CardTitle>
                        <Badge variant="outline" className="text-xs font-mono">
                          {config.configCode}
                        </Badge>
                        {config.isDefault && (
                          <Badge className="text-xs bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300">
                            Default
                          </Badge>
                        )}
                        <Badge
                          variant={config.isEnabled ? "default" : "secondary"}
                          className={`text-xs ${config.isEnabled ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300" : ""}`}
                        >
                          {config.isEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>{PROVIDER_LABELS[config.providerType] ?? config.providerType}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span>Purpose: {PURPOSE_LABELS[config.purpose] ?? config.purpose}</span>
                        {config.modelId && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="font-mono">{config.modelId}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {(canManage || canManageSecrets || canTest) && <DropdownMenu>
                    <DropdownMenuTrigger render={<Button aria-label={`Actions for ${config.providerName}`} disabled={busy || uncertain} variant="ghost" size="icon" className="h-8 w-8 shrink-0" />}>
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canManage && <DropdownMenuItem onClick={() => setEditTarget(config)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit Configuration
                      </DropdownMenuItem>}
                      {canManageSecrets && <DropdownMenuItem onClick={() => setSecretTarget(config)}>
                        <Key className="mr-2 h-4 w-4" />
                        Update API Key
                      </DropdownMenuItem>}
                      {canTest && <DropdownMenuItem
                        onClick={() => handleTest(config)}
                        disabled={busy || uncertain}
                      >
                        <Wifi className="mr-2 h-4 w-4" />
                        {isTestingThis ? "Testing..." : "Test Connection"}
                      </DropdownMenuItem>}
                      {canManage && <DropdownMenuSeparator />}
                      {canManage && <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(config)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>}
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  {/* Secret preview */}
                  <div className="flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5 text-muted-foreground" />
                    {config.maskedSecretPreview ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {config.maskedSecretPreview}
                      </code>
                    ) : config.secretRef ? (
                      <span className="text-muted-foreground">env: {config.secretRef}</span>
                    ) : (
                      <span className="text-amber-800 dark:text-amber-300">No key configured</span>
                    )}
                  </div>

                  {/* Test status */}
                  <TestStatusBadge
                    status={liveResult?.ok === true ? "success" : liveResult?.ok === false ? "failed" : config.lastTestStatus}
                    lastTestAt={config.lastTestAt}
                    isTesting={isTestingThis}
                  />

                  {/* Human review */}
                  {config.requiresHumanReview && (
                    <Badge variant="outline" className="text-xs text-amber-800 border-amber-200 bg-amber-50 dark:text-amber-300 dark:border-amber-700 dark:bg-amber-950/20">
                      Human Review Required
                    </Badge>
                  )}

                  {/* Confidence */}
                  <span className="text-muted-foreground">
                    Confidence ≥{" "}
                    <span className="font-medium text-foreground">
                      {(config.confidenceThreshold * 100).toFixed(0)}%
                    </span>
                  </span>
                </div>

                {config.notes && (
                  <p className="mt-2 text-xs text-muted-foreground">{config.notes}</p>
                )}

                {/* Test button inline */}
                <div className="mt-3 flex gap-2">
                  {canTest && <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => handleTest(config)}
                    disabled={busy || uncertain}
                  >
                    <Wifi className="h-3.5 w-3.5" />
                    {isTestingThis ? "Testing..." : "Test Connection"}
                  </Button>}
                  {canManageSecrets && <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setSecretTarget(config)}
                    disabled={busy || uncertain}
                  >
                    <Key className="h-3.5 w-3.5" />
                    Update API Key
                  </Button>}
                </div>
              </CardContent>
            </Card>
          );
        }} />}
      </div>

      {editTarget && canManage && (
        <AiProviderFormDialog
          open={!!editTarget}
          config={editTarget}
          canManageSecrets={canManageSecrets}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            toast.success("Provider updated");
            setEditTarget(null);
          }}
        />
      )}

      {secretTarget && canManageSecrets && (
        <AiProviderSecretDialog
          open={!!secretTarget}
          config={secretTarget}
          onClose={() => setSecretTarget(null)}
          onSaved={() => {
            toast.success("API key reference saved");
            setSecretTarget(null);
          }}
        />
      )}
    </>
  );
}

function TestStatusBadge({
  status,
  lastTestAt,
  isTesting,
}: {
  status: string | null | undefined;
  lastTestAt: string | null | undefined;
  isTesting: boolean;
}) {
  if (isTesting) {
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Clock className="h-3.5 w-3.5 animate-spin" />
        Testing…
      </span>
    );
  }
  if (!status || status === "not_tested") {
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <WifiOff className="h-3.5 w-3.5" />
        Not tested
      </span>
    );
  }
  if (status === "success") {
    return (
      <span className="flex items-center gap-1 text-green-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {lastTestAt ? `Tested ${formatRelativeTime(lastTestAt)}` : "Tested"}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-destructive">
      <XCircle className="h-3.5 w-3.5" />
      Test failed. Review the provider configuration.
    </span>
  );
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  } catch {
    return "";
  }
}
