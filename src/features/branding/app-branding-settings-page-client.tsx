"use client";

import { useState, useTransition, useRef, useEffect, useLayoutEffect, useId } from "react";
import { useReadCacheOwner } from '@/components/layout/read-cache-boundary';
import { z } from 'zod';
import { useRouter } from "next/navigation";
import { FormErrorSummary, useInlineFieldFeedback } from "@/components/workspace/form-feedback";
import { collectWorkspaceFieldIssues, type WorkspaceFieldIssue } from "@/lib/workspace/form-validation";
import { useWorkspaceTabDirty } from "@/hooks/use-workspace-tab-dirty";
import { toast } from "sonner";
import { Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RequiredLabel } from "@/components/erp/required-label";
import { ERPPageHeader } from "@/components/erp/page-header";
import { BrandingAssetUploadCard } from "./branding-asset-upload-card";
import { updateAppBrandingSettings } from "@/server/actions/branding/app-settings";
import type { AppBrandingSettings } from "@/lib/branding";
import type { RuntimeAppBranding } from "@/lib/branding/runtime-types";
import type { AppBrandingAssetType } from "@/lib/branding";
import { createWorkspaceSaveAttempt, type WorkspaceSaveContract } from "@/lib/workspace/save-contract";

type AppBrandingSettingsPageClientProps = {
  settings: AppBrandingSettings;
  runtimeBranding: RuntimeAppBranding;
  canManage: boolean;
  canUpload: boolean;
};

const APP_ASSET_DEFS: {
  type: AppBrandingAssetType;
  label: string;
  description: string;
  required?: boolean;
}[] = [
  {
    type: "app_logo",
    label: "App Logo",
    description: "Expanded sidebar and login screen logo.",
    required: true,
  },
  {
    type: "app_logo_small",
    label: "Small Logo",
    description: "Collapsed sidebar icon.",
  },
  {
    type: "favicon",
    label: "Favicon",
    description: "Browser tab icon (PNG, 32×32 recommended; convert ICO first).",
  },
  {
    type: "login_background",
    label: "Login Background",
    description: "Optional background image for the login screen.",
  },
];

const settingsReceipt=z.object({id:z.number().int().positive(),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean()});
export function AppBrandingSettingsPageClient(props:AppBrandingSettingsPageClientProps){
  return <AppBrandingSettingsSession key={props.settings.id} {...props}/>;
}
function AppBrandingSettingsSession({
  settings,
  runtimeBranding,
  canManage,
  canUpload,
}: AppBrandingSettingsPageClientProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    app_name: settings.app_name,
    app_short_name: settings.app_short_name ?? "",
    tagline: settings.tagline ?? "",
    support_email: settings.support_email ?? "",
    support_phone: settings.support_phone ?? "",
    footer_text: settings.footer_text ?? "",
    theme_primary_color: settings.theme_primary_color ?? "",
    theme_secondary_color: settings.theme_secondary_color ?? "",
    theme_accent_color: settings.theme_accent_color ?? "",
    login_title: settings.login_title ?? "",
    login_subtitle: settings.login_subtitle ?? "",
  });
  const root = useRef<HTMLFormElement>(null);
  const flight = useRef(false);
  const attempt = useRef(createWorkspaceSaveAttempt());
  const pending=useRef<{payload:Parameters<typeof updateAppBrandingSettings>[0];contract:WorkspaceSaveContract;fingerprint:string;hadUnknown:boolean}|null>(null);
  const confirmed=useRef<{fingerprint:string;failed:boolean}|null>(null);
  const owner=useReadCacheOwner(),activation=useRef<{live:boolean}|null>(null);
  useLayoutEffect(()=>{const token={live:true};activation.current=token;return()=>{token.live=false;};},[owner]);
  const [revision, setRevision] = useState(settings.workspace_revision == null ? null : String(settings.workspace_revision));
  const fieldId = useId();
  const [initial, setInitial] = useState(JSON.stringify(form));
  const dirty = JSON.stringify(form) !== initial;
  const [issues, setIssues] = useState<WorkspaceFieldIssue[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAsset, setPendingAsset] = useState<AppBrandingAssetType | null>(null);
  const pendingAssetRef = useRef<AppBrandingAssetType | null>(null);
  useInlineFieldFeedback(issues);
  useWorkspaceTabDirty({ isDirty: dirty, enabled: canManage });
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const [isSaving, startSaveTransition] = useTransition();

  const handleSave = () => {
    const token=activation.current,current=()=>!!token?.live&&activation.current===token&&owner?.isLive()!==false;
    if (!current() || !canManage || flight.current || pendingAssetRef.current !== null) return;
    const fingerprint=JSON.stringify(form);
    if(confirmed.current&&(confirmed.current.failed||confirmed.current.fingerprint===fingerprint)){
      try{router.refresh();setSaveError(null);}catch{setSaveError('Saved, but the display could not be refreshed. Refresh this view.');}return;
    }
    const invalid = root.current ? collectWorkspaceFieldIssues(root.current) : [];
    setIssues(invalid);
    if (invalid.length) { invalid[0].control?.focus(); return; }
    flight.current = true;
    setSaveError(null);
    startSaveTransition(async () => {
      try {
      const payload = {
        id: settings.id,
        app_name: form.app_name.trim(),
        app_short_name: form.app_short_name.trim() || null,
        tagline: form.tagline.trim() || null,
        support_email: form.support_email.trim() || null,
        support_phone: form.support_phone.trim() || null,
        footer_text: form.footer_text.trim() || null,
        theme_primary_color: form.theme_primary_color.trim() || null,
        theme_secondary_color: form.theme_secondary_color.trim() || null,
        theme_accent_color: form.theme_accent_color.trim() || null,
        login_title: form.login_title.trim() || null,
        login_subtitle: form.login_subtitle.trim() || null,
      };
      if(pending.current&&pending.current.fingerprint!==fingerprint)throw Error('Restore the submitted entries.');
      pending.current??={payload:structuredClone(payload),contract:attempt.current.begin(payload,revision),fingerprint,hadUnknown:false};
      const request=pending.current;
      let result:Awaited<ReturnType<typeof updateAppBrandingSettings>>;
      try{result=await updateAppBrandingSettings(request.payload,request.contract);}catch{request.hadUnknown=true;throw Error('Save unconfirmed.');}
      if(!current())return;
      if(!result||typeof result.success!=='boolean'){request.hadUnknown=true;setSaveError('Settings save response incomplete. Retry the unchanged entries.');return;}
      if (!result.success) {
        const earlier=request.hadUnknown;request.hadUnknown ||= result.uncertain===true;
        if(!request.hadUnknown){attempt.current.resolved();pending.current=null;}
        setSaveError(earlier?'The earlier settings save is still unconfirmed. Retry the unchanged entries.':result.error ?? "Settings save is unconfirmed. Retry the unchanged entries.");
        return;
      }
      const receipt=settingsReceipt.safeParse(result.data);
      if(!receipt.success||receipt.data.id!==request.payload.id){request.hadUnknown=true;setSaveError('Settings save response incomplete. Retry the unchanged entries.');return;}
      const witness={fingerprint:request.fingerprint,failed:false};confirmed.current=witness;
      try{attempt.current.resolved();pending.current=null;setRevision(receipt.data.revision);setInitial(request.fingerprint);}catch{witness.failed=true;}
      if(current())try{toast.success(receipt.data.changed === false ? "No changes to save" : "App branding settings saved");}catch{witness.failed=true;}
      if(current())try{router.refresh();}catch{witness.failed=true;}
      if(current()&&witness.failed)setSaveError('Saved, but the display could not be refreshed. Refresh this view.');
      } catch {
        if(current())setSaveError("Save unconfirmed. Restore the submitted entries and retry to recover the same operation, or reopen to reconcile it.");
      } finally { if(current())flight.current = false; }
    });
  };

  const getAsset = (type: AppBrandingAssetType) => {
    const asset = runtimeBranding.assets[type];
    if (!asset) return null;
    return {
      id: asset.id,
      workspaceRevision: asset.workspaceRevision,
      originalFilename: asset.originalFilename,
      mimeType: asset.mimeType,
      fileSizeBytes: asset.fileSizeBytes,
      versionNo: asset.versionNo,
      updatedAt: asset.updatedAt,
      previewUrl: asset.publicUrl,
    };
  };

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="App Branding"
        description="Configure the tenant-global ERP shell identity — app name, login screen, sidebar logos, favicon, and theme colors."
        breadcrumbs={[
          { label: "Administration", href: "/admin/users" },
          { label: "App Branding" },
        ]}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {!canManage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          You have view-only access. Contact an administrator with{" "}
          <code className="text-xs">branding.app.manage</code> to edit settings or upload assets.
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <form ref={root} noValidate className="algt-form-surface rounded-sm border border-border bg-card p-5 space-y-4" onSubmit={event => { event.preventDefault(); handleSave(); }} onChangeCapture={() => { if (issues.length) queueMicrotask(() => { if (root.current) setIssues(collectWorkspaceFieldIssues(root.current)); }); }}>
          <FormErrorSummary issues={issues} onReveal={issue => issue.control?.focus()} />
          {saveError && <p role="alert" className="text-destructive">{saveError}</p>}
          <h2 className="text-sm font-semibold">Identity & Theme</h2>
          <p className="text-sm text-muted-foreground">Unsaved settings stay on this page only. Save before refreshing or uploading an asset.</p>

          {pendingAsset && <p role="status">Finish or retry the current asset operation before editing these settings.</p>}
          <fieldset disabled={isSaving || pendingAsset !== null} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <RequiredLabel required={canManage} htmlFor={`${fieldId}-app_name`}>App Name</RequiredLabel>
              <Input id={`${fieldId}-app_name`} name="app_name" required pattern={".*\\S.*"} maxLength={200}
                value={form.app_name}
                disabled={!canManage}
                onChange={(e) => setForm((f) => ({ ...f, app_name: e.target.value }))}
              />
            </div>
            <div>
              <RequiredLabel htmlFor={`${fieldId}-app_short_name`}>Short Name</RequiredLabel>
              <Input id={`${fieldId}-app_short_name`} name="app_short_name" maxLength={50}
                value={form.app_short_name}
                disabled={!canManage}
                placeholder="ALGT"
                onChange={(e) => setForm((f) => ({ ...f, app_short_name: e.target.value }))}
              />
            </div>
            <div>
              <RequiredLabel htmlFor={`${fieldId}-tagline`}>Tagline</RequiredLabel>
              <Input id={`${fieldId}-tagline`} name="tagline" maxLength={300}
                value={form.tagline}
                disabled={!canManage}
                placeholder="Enterprise resource planning"
                onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              />
            </div>
            <div>
              <RequiredLabel htmlFor={`${fieldId}-login_title`}>Login Title</RequiredLabel>
              <Input id={`${fieldId}-login_title`} name="login_title" maxLength={200}
                value={form.login_title}
                disabled={!canManage}
                placeholder={form.app_name}
                onChange={(e) => setForm((f) => ({ ...f, login_title: e.target.value }))}
              />
            </div>
            <div>
              <RequiredLabel htmlFor={`${fieldId}-login_subtitle`}>Login Subtitle</RequiredLabel>
              <Input id={`${fieldId}-login_subtitle`} name="login_subtitle" maxLength={300}
                value={form.login_subtitle}
                disabled={!canManage}
                placeholder="Sign in to your workspace"
                onChange={(e) => setForm((f) => ({ ...f, login_subtitle: e.target.value }))}
              />
            </div>
            <div>
              <RequiredLabel htmlFor={`${fieldId}-support_email`}>Support Email</RequiredLabel>
              <Input
                type="email" id={`${fieldId}-support_email`} name="support_email"
                value={form.support_email}
                disabled={!canManage}
                onChange={(e) => setForm((f) => ({ ...f, support_email: e.target.value }))}
              />
            </div>
            <div>
              <RequiredLabel htmlFor={`${fieldId}-support_phone`}>Support Phone</RequiredLabel>
              <Input id={`${fieldId}-support_phone`} name="support_phone" maxLength={50}
                value={form.support_phone}
                disabled={!canManage}
                onChange={(e) => setForm((f) => ({ ...f, support_phone: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <RequiredLabel htmlFor={`${fieldId}-footer_text`}>Footer Text</RequiredLabel>
              <Textarea
                rows={2} id={`${fieldId}-footer_text`} name="footer_text" maxLength={1000}
                value={form.footer_text}
                disabled={!canManage}
                onChange={(e) => setForm((f) => ({ ...f, footer_text: e.target.value }))}
              />
            </div>
            <div>
              <RequiredLabel htmlFor={`${fieldId}-theme_primary_color`}>Primary Color</RequiredLabel>
              <div className="flex gap-2">
                <Input
                  type="color" aria-label="Primary Color picker"
                  className="w-12 px-1"
                  disabled={!canManage}
                  value={form.theme_primary_color || "#1e293b"}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, theme_primary_color: e.target.value }))
                  }
                />
                <Input id={`${fieldId}-theme_primary_color`} name="theme_primary_color" maxLength={7} pattern="#[0-9a-fA-F]{6}"
                  value={form.theme_primary_color}
                  disabled={!canManage}
                  placeholder="#1e293b"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, theme_primary_color: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <RequiredLabel htmlFor={`${fieldId}-theme_secondary_color`}>Secondary Color</RequiredLabel>
              <div className="flex gap-2">
                <Input
                  type="color"
                  className="w-12 px-1"
                  disabled={!canManage}
                  aria-label="Secondary Color picker" value={form.theme_secondary_color || "#475569"}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, theme_secondary_color: e.target.value }))
                  }
                />
                <Input id={`${fieldId}-theme_secondary_color`} name="theme_secondary_color" maxLength={7} pattern="#[0-9a-fA-F]{6}"
                  value={form.theme_secondary_color}
                  disabled={!canManage}
                  placeholder="#475569"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, theme_secondary_color: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <RequiredLabel htmlFor={`${fieldId}-theme_accent_color`}>Accent Color</RequiredLabel>
              <div className="flex gap-2">
                <Input
                  type="color"
                  className="w-12 px-1"
                  disabled={!canManage}
                  aria-label="Accent Color picker" value={form.theme_accent_color || "#2563eb"}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, theme_accent_color: e.target.value }))
                  }
                />
                <Input id={`${fieldId}-theme_accent_color`} name="theme_accent_color" maxLength={7} pattern="#[0-9a-fA-F]{6}"
                  value={form.theme_accent_color}
                  disabled={!canManage}
                  placeholder="#2563eb"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, theme_accent_color: e.target.value }))
                  }
                />
              </div>
            </div>
          </fieldset>

          {canManage ? (
            <div className="flex justify-end pt-2">
              <Button type="submit" size="sm" className="gap-1.5" disabled={isSaving || pendingAsset !== null}>
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          ) : null}
        </form>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold px-1">Branding Assets</h2>
          {dirty && canUpload && <p role="status" className="text-sm text-muted-foreground">Save your settings before changing branding assets.</p>}
          {runtimeBranding.assetStatus === "unavailable" ? <p role="alert" className="text-destructive">Branding assets could not be loaded. Refresh before uploading or replacing a file.</p> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {APP_ASSET_DEFS.map((def) => (
              <BrandingAssetUploadCard
                key={def.type}
                label={def.label}
                description={def.description}
                assetType={def.type}
                appSettingsId={settings.id}
                parentRevision={revision ?? undefined}
                asset={getAsset(def.type)}
                canUpload={canUpload}
                disabled={dirty || isSaving || pendingAsset !== null && pendingAsset !== def.type || runtimeBranding.settingsRevision !== undefined && runtimeBranding.settingsRevision !== revision}
                disabledReason={dirty ? "Save your settings before changing branding assets." : pendingAsset ? "Finish the current asset operation first." : "Wait for the current settings version to load before changing an asset."}
                onPendingChange={pending => {
                  if (pending && pendingAssetRef.current !== null && pendingAssetRef.current !== def.type) return false;
                  pendingAssetRef.current = pending ? def.type : null;
                  setPendingAsset(pendingAssetRef.current); return true;
                }}
                required={def.required}
                onChanged={receipt => {setRevision(receipt.parent_revision);router.refresh();}}
              />
            ))}
          </div>}
        </div>
      </div>
    </div>
  );
}
