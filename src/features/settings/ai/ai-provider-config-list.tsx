"use client";

import { useState } from "react";
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
  configs: AiProviderConfig[];
  onAdd: () => void;
}

export function AiProviderConfigList({ configs, onAdd }: AiProviderConfigListProps) {
  const [editTarget, setEditTarget] = useState<AiProviderConfig | null>(null);
  const [secretTarget, setSecretTarget] = useState<AiProviderConfig | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; message: string }>>({});

  const handleDelete = async (config: AiProviderConfig) => {
    if (!confirm(`Delete provider "${config.providerName}"? This cannot be undone.`)) return;
    const result = await deleteAiProviderConfig(config.id);
    if (result.success) {
      toast.success("Provider deleted");
    } else {
      toast.error(result.error ?? "Failed to delete provider");
    }
  };

  const handleTest = async (config: AiProviderConfig) => {
    setTestingId(config.id);
    try {
      const result = await testAiProviderConnection(config.id);
      if (result.success && result.data) {
        setTestResults((prev) => ({ ...prev, [config.id]: result.data! }));
        if (result.data.ok) {
          toast.success(`Connected: ${result.data.message}`);
        } else {
          toast.error(`Test failed: ${result.data.message}`);
        }
      } else {
        toast.error(result.error ?? "Test failed");
      }
    } finally {
      setTestingId(null);
    }
  };

  if (configs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <Zap className="h-8 w-8 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No AI provider configurations yet.</p>
          <Button onClick={onAdd} variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add First Provider
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {configs.map((config) => {
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

                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" />}>
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditTarget(config)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit Configuration
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSecretTarget(config)}>
                        <Key className="mr-2 h-4 w-4" />
                        Update API Key
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleTest(config)}
                        disabled={isTestingThis}
                      >
                        <Wifi className="mr-2 h-4 w-4" />
                        {isTestingThis ? "Testing..." : "Test Connection"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(config)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                      <span className="text-amber-600">No key configured</span>
                    )}
                  </div>

                  {/* Test status */}
                  <TestStatusBadge
                    status={liveResult?.ok === true ? "success" : liveResult?.ok === false ? "failed" : config.lastTestStatus}
                    message={liveResult?.message ?? config.lastTestMessage}
                    lastTestAt={config.lastTestAt}
                    isTesting={isTestingThis}
                  />

                  {/* Human review */}
                  {config.requiresHumanReview && (
                    <Badge variant="outline" className="text-xs text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => handleTest(config)}
                    disabled={isTestingThis}
                  >
                    <Wifi className="h-3.5 w-3.5" />
                    {isTestingThis ? "Testing..." : "Test Connection"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setSecretTarget(config)}
                  >
                    <Key className="h-3.5 w-3.5" />
                    Update API Key
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {editTarget && (
        <AiProviderFormDialog
          open={!!editTarget}
          config={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            toast.success("Provider updated");
            setEditTarget(null);
          }}
        />
      )}

      {secretTarget && (
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
  message,
  lastTestAt,
  isTesting,
}: {
  status: string | null | undefined;
  message: string | null | undefined;
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
      {message ? message.substring(0, 60) : "Test failed"}
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
