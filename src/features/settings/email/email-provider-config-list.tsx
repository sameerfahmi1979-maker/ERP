"use client";
import { useRef, useState } from "react";
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
export function EmailProviderConfigList({ configs, onRefresh, canManage = false, canTest = false, canSecrets = false }: Props) {
  const [editing, setEditing] = useState<EmailProviderConfig | null>(null), [secret, setSecret] = useState<EmailProviderConfig | null>(null), [test, setTest] = useState<EmailProviderConfig | null>(null);
  const [deleting, setDeleting] = useState<EmailProviderConfig | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const flight = useRef(false);
  const act = async (provider: EmailProviderConfig, kind: "connection" | "toggle" | "default" | "delete") => {
    if (flight.current || (kind === "connection" ? !canTest : !canManage)) return;
    flight.current = true; setBusy(true); setMessage("");
    try {
      const result = await (kind === "connection" ? testEmailProviderConnection(provider.id) : kind === "toggle" ? updateEmailProviderConfig(provider.id, {is_enabled: !provider.isEnabled}) : kind === "default" ? setDefaultEmailProviderConfig(provider.id) : deleteEmailProviderConfig(provider.id));
      if (result.success) { setMessage(kind === "connection" ? "Connection check succeeded. This does not verify inbox delivery." : "Provider change confirmed."); setDeleting(null); onRefresh(); }
      else setMessage("Operation was not confirmed. Refresh settings and review the current state before retrying.");
    } catch { setMessage("Response unavailable. Refresh settings before retrying."); }
    finally { flight.current = false; setBusy(false); }
  };
  const columns: ColumnDef<EmailProviderConfig>[] = [
    {accessorKey:"providerName",header:"Provider",size:220},
    {accessorKey:"providerCode",header:"Code",size:160},
    {accessorKey:"providerType",header:"Type",size:180},
    {accessorKey:"senderEmail",header:"Sender",size:220},
    {accessorKey:"isEnabled",header:"Enabled",size:110,cell:({row})=>row.original.isEnabled?"Yes":"No"},
    {accessorKey:"isDefault",header:"Default",size:110,cell:({row})=>row.original.isDefault?"Yes":"No"},
    {accessorKey:"lastTestStatus",header:"Connection check",size:150},
    {id:"secret",header:"Secret",size:150,accessorFn:p=>p.maskedSecretPreview?"Configured":"Not configured"},
    {id:"actions",header:"Actions",size:360,enableSorting:false,cell:({row})=>{
      const p=row.original;
      return <div className="flex flex-wrap gap-2">
        {canManage && <Button disabled={busy} variant="outline" size="sm" onClick={()=>setEditing(p)}>Edit</Button>}
        {canSecrets && <Button disabled={busy} variant="outline" size="sm" onClick={()=>setSecret(p)}>Update secret</Button>}
        {canTest && <><Button disabled={busy} variant="outline" size="sm" onClick={()=>void act(p,"connection")}>Test connection</Button><Button disabled={busy || !p.isEnabled} variant="outline" size="sm" onClick={()=>setTest(p)}>Send test email</Button></>}
        {canManage && <><Button disabled={busy} variant="outline" size="sm" onClick={()=>void act(p,"toggle")}>{p.isEnabled?"Disable":"Enable"}</Button>{!p.isDefault && <Button disabled={busy} variant="outline" size="sm" onClick={()=>void act(p,"default")}>Set default</Button>}<Button disabled={busy} variant="outline" size="sm" onClick={()=>setDeleting(p)}>Delete</Button></>}
      </div>;
    }},
  ];
  return <div className="space-y-3">
    {message && <p role="status">{message}</p>}
    <ERPDataTable tableId="settings.email.providers" columns={columns.filter(c=>c.id!=="actions" || canManage || canTest || canSecrets)} data={configs} enableRowSelection={false} searchPlaceholder="Search email providers…" />
    {editing && canManage && <EmailProviderFormDialog open mode="edit" initialData={editing} onOpenChange={v=>{if(!v)setEditing(null);}} onSuccess={()=>{setEditing(null);onRefresh();}} />}
    {secret && canSecrets && <EmailProviderSecretDialog open providerId={secret.id} providerName={secret.providerName} currentMaskedPreview={secret.maskedSecretPreview} onOpenChange={v=>{if(!v)setSecret(null);}} onSuccess={()=>{setSecret(null);onRefresh();}} />}
    {test && canTest && <EmailTestSendDialog open providerId={test.id} providerName={test.providerName} defaultRecipient={test.defaultRecipientForTests} onOpenChange={v=>{if(!v)setTest(null);}} onSuccess={onRefresh} />}
    <AlgtDialog open={!!deleting} title="Delete email provider?" onOpenChange={open=>{if(!busy&&!open)setDeleting(null);}} actions={<><Button disabled={busy} variant="outline" onClick={()=>setDeleting(null)}>Keep provider</Button><Button disabled={busy || !canManage} onClick={()=>{if(deleting)void act(deleting,"delete");}}>Confirm deletion</Button></>}>
      <p>Delete {deleting?.providerName}? Dependent delivery may stop. This action cannot be undone through this screen.</p>
    </AlgtDialog>
  </div>;
}
