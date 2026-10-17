"use client";
import { useRef, useState } from "react";
import { createWorkspaceSaveAttempt, type WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import { Button } from "@/components/ui/button";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import type { ColumnDef } from "@tanstack/react-table";
import type { EmailProviderConfig } from "@/lib/email/providers/types";
import { deleteEmailProviderConfig, setDefaultEmailProviderConfig, testEmailProviderConnection, updateEmailProviderConfig } from "@/server/actions/settings/email-settings";
import { EmailProviderFormDialog } from "./email-provider-form-dialog";
import { EmailProviderSecretDialog } from "./email-provider-secret-dialog";
import { EmailTestSendDialog } from "./email-test-send-dialog";

interface Props { configs: EmailProviderConfig[]; onRefresh: () => void; onAdd: () => void; canManage?: boolean; canTest?: boolean; canSecrets?: boolean }
type ProviderChange = {id: number; workspaceRevision: string | null; contract: WorkspaceSaveContract; hadUnknown: boolean} & ({kind: 'toggle'; payload: {is_enabled: boolean}} | {kind: 'default' | 'delete'; payload: Record<string, never>});
export function EmailProviderConfigList({ configs, onRefresh, canManage = false, canTest = false, canSecrets = false }: Props) {
  const [editing, setEditing] = useState<EmailProviderConfig | null>(null), [secret, setSecret] = useState<EmailProviderConfig | null>(null), [test, setTest] = useState<EmailProviderConfig | null>(null);
  const [deleting, setDeleting] = useState<EmailProviderConfig | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const flight = useRef(false);
  const attempt = useRef(createWorkspaceSaveAttempt());
  const pending = useRef<ProviderChange | null>(null);
  const [pendingView, setPendingView] = useState<Pick<ProviderChange, 'id' | 'kind' | 'payload'> | null>(null);
  const [changeUnconfirmed, setChangeUnconfirmed] = useState(false);
  const [confirmed, setConfirmed] = useState<Record<number, string | null>>({});
  const confirmedRef = useRef<Record<number, string | null>>({});
  const [health, setHealth] = useState<Record<number, { status: string; previousAt: string | null | undefined }>>({});
  const [displayError, setDisplayError] = useState(false);
  const isConfirmed = (provider: EmailProviderConfig) => Object.hasOwn(confirmed, provider.id) && confirmed[provider.id] === (provider.workspaceRevision ?? null);
  const confirm = (provider: {id: number; workspaceRevision?: string | null}) => {
    confirmedRef.current = {...confirmedRef.current, [provider.id]: provider.workspaceRevision ?? null};
    setConfirmed(confirmedRef.current);
  };
  const refreshSettings = () => { try { onRefresh(); } catch { setDisplayError(true); } };
  const matches = (request: Pick<ProviderChange, 'id' | 'kind' | 'payload'> | null, provider: EmailProviderConfig, kind: ProviderChange['kind']) => !request || (request.id === provider.id && request.kind === kind && (kind !== 'toggle' || request.payload.is_enabled === !provider.isEnabled));
  const runChange = async (request: ProviderChange) => {
    if (!canManage || flight.current || pending.current !== request) return;
    flight.current = true; setBusy(true); setMessage('');
    try {
      const result = await (request.kind === 'toggle' ? updateEmailProviderConfig(request.id, request.payload, request.contract) : request.kind === 'default' ? setDefaultEmailProviderConfig(request.id, request.contract) : deleteEmailProviderConfig(request.id, request.contract));
      if (!result.success && (result.uncertain || request.hadUnknown)) {
        request.hadUnknown = true; setChangeUnconfirmed(true); setMessage('Response unconfirmed. Retry the original provider change to recover its result.'); return;
      }
      if (pending.current === request) { pending.current = null; setPendingView(null); attempt.current.resolved(); }
      setChangeUnconfirmed(false);
      if (result.success) { confirm(request); setMessage('Provider change confirmed.'); setDeleting(null); refreshSettings(); }
      else setMessage(result.error ?? 'Operation was not confirmed. Retry the same change or refresh to reconcile it.');
    } catch { request.hadUnknown = true; setChangeUnconfirmed(true); setMessage('Response unconfirmed. Retry the original provider change to recover its result.'); }
    finally { flight.current = false; setBusy(false); }
  };
  const act = async (provider: EmailProviderConfig, kind: "connection" | "toggle" | "default" | "delete") => {
    if (flight.current || (kind === "connection" ? !canTest : !canManage || (Object.hasOwn(confirmedRef.current, provider.id) && confirmedRef.current[provider.id] === (provider.workspaceRevision ?? null)))) return;
    if (kind !== 'connection') {
      if (!matches(pending.current, provider, kind) || (kind === 'delete' && provider.isDefault)) return;
      if (!pending.current) {
        const intent = kind === 'toggle' ? {kind, payload: {is_enabled: !provider.isEnabled}} as const : {kind, payload: {} as Record<string, never>};
        pending.current = {id: provider.id, workspaceRevision: provider.workspaceRevision ?? null, ...intent, contract: attempt.current.begin([kind, provider.id, intent.payload], provider.workspaceRevision ?? null), hadUnknown: false};
        setPendingView(pending.current);
      }
      await runChange(pending.current); return;
    }
    flight.current = true; setBusy(true); setMessage("");
    try {
      const result = await testEmailProviderConnection(provider.id);
      if (kind === "connection" && result.data && "status" in result.data) {
        const status = result.data.status;
        setHealth(previous => ({...previous, [provider.id]: {status, previousAt: provider.lastTestAt}}));
        setMessage(result.success ? "Connection check succeeded. This does not verify inbox delivery." : "Connection check failed. Review the provider configuration.");
        refreshSettings();
      }
      else if (result.success) { setMessage("Connection check succeeded. This does not verify inbox delivery."); setDeleting(null); refreshSettings(); }
      else setMessage(result.error ?? "Operation was not confirmed. Retry the same change or refresh to reconcile it.");
    } catch { setMessage("Response unconfirmed. Retry the same operation, or refresh settings to reconcile it before making a different change."); }
    finally { flight.current = false; setBusy(false); }
  };
  const columns: ColumnDef<EmailProviderConfig>[] = [
    {accessorKey:"providerName",header:"Provider",size:220},
    {accessorKey:"providerCode",header:"Code",size:160},
    {accessorKey:"providerType",header:"Type",size:180},
    {accessorKey:"senderEmail",header:"Sender",size:220},
    {accessorKey:"isEnabled",header:"Enabled",size:110,cell:({row})=>row.original.isEnabled?"Yes":"No"},
    {accessorKey:"isDefault",header:"Default",size:110,cell:({row})=>row.original.isDefault?"Yes":"No"},
    {accessorKey:"lastTestStatus",header:"Connection check",size:150,cell:({row})=>health[row.original.id]?.previousAt === row.original.lastTestAt ? health[row.original.id]?.status ?? row.original.lastTestStatus : row.original.lastTestStatus},
    {id:"secret",header:"Secret",size:150,accessorFn:p=>p.maskedSecretPreview?"Configured":"Not configured"},
    {id:"actions",header:"Actions",size:360,enableSorting:false,cell:({row})=>{
      const p=row.original;
      return <div className="flex flex-wrap gap-2">
        {canManage && <Button disabled={busy || changeUnconfirmed || isConfirmed(p)} variant="outline" size="sm" onClick={()=>setEditing(p)}>Edit</Button>}
        {canSecrets && <Button disabled={busy || changeUnconfirmed || isConfirmed(p)} variant="outline" size="sm" onClick={()=>setSecret(p)}>Update secret</Button>}
        {canTest && <><Button disabled={busy} variant="outline" size="sm" onClick={()=>void act(p,"connection")}>Test connection</Button><Button disabled={busy || !p.isEnabled} variant="outline" size="sm" onClick={()=>setTest(p)}>Send test email</Button></>}
        {canManage && <><Button disabled={busy || isConfirmed(p) || !matches(pendingView,p,'toggle')} variant="outline" size="sm" onClick={()=>void act(p,"toggle")}>{p.isEnabled?"Disable":"Enable"}</Button>{!p.isDefault && <Button disabled={busy || isConfirmed(p) || !matches(pendingView,p,'default')} variant="outline" size="sm" onClick={()=>void act(p,"default")}>Set default</Button>}<Button disabled={busy || isConfirmed(p) || !matches(pendingView,p,'delete')} variant="outline" size="sm" onClick={()=>setDeleting(p)}>Retire</Button></>}
      </div>;
    }},
  ];
  return <div className="space-y-3">
    {message && <p role="status">{message}</p>}
    {changeUnconfirmed && <Button type="button" variant="outline" disabled={busy || !canManage} onClick={()=>{if(pending.current)void runChange(pending.current);}}>Retry original provider change</Button>}
    {(Object.keys(confirmed).length > 0 || displayError) && <div className="space-y-2">{displayError && <p role="status">The display could not finish updating. Confirmed changes and recorded connection results are unchanged.</p>}<Button type="button" variant="outline" onClick={refreshSettings}>Refresh settings only</Button></div>}
    <ERPDataTable presentation="worklist" tableId="settings.email.providers" columns={columns.filter(c=>c.id!=="actions" || canManage || canTest || canSecrets)} data={configs} enableRowSelection={false} searchPlaceholder="Search email providers…" />
    {editing && canManage && <EmailProviderFormDialog open mode="edit" initialData={editing} onOpenChange={v=>{if(!v)setEditing(null);}} onSuccess={()=>{confirm(editing);setEditing(null);refreshSettings();}} />}
    {secret && canSecrets && <EmailProviderSecretDialog open providerId={secret.id} providerRevision={secret.workspaceRevision} providerName={secret.providerName} currentMaskedPreview={secret.maskedSecretPreview} onOpenChange={v=>{if(!v)setSecret(null);}} onSuccess={()=>{confirm(secret);setSecret(null);refreshSettings();}} />}
    {test && canTest && <EmailTestSendDialog open providerId={test.id} providerName={test.providerName} defaultRecipient={test.defaultRecipientForTests} onOpenChange={v=>{if(!v)setTest(null);}} onSuccess={refreshSettings} />}
    <AlgtDialog open={!!deleting} title="Retire email provider?" onOpenChange={open=>{if(!busy&&!open)setDeleting(null);}} actions={<><Button disabled={busy} variant="outline" onClick={()=>setDeleting(null)}>Keep provider</Button><Button disabled={busy || !canManage || deleting?.isDefault} onClick={()=>{if(deleting)void act(deleting,"delete");}}>Confirm retirement</Button></>}>
      <p>Retire {deleting?.providerName}? Its configuration and delivery history will be preserved. Select a replacement first if this is the default. Pending work tied to it needs reconciliation before release.</p>
    </AlgtDialog>
  </div>;
}
