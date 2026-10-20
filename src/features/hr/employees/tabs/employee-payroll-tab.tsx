"use client";
import { RecordCollection } from "@/components/erp/table/record-collection";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import {PayrollReadScope,usePayrollReadScope, usePayrollPoint, usePayrollRecords} from "@/hooks/use-hr-payroll-records";
import{PayrollRecordEditor}from'../payroll-record-editor';
import{HrChildRecoveryPanel}from'../hr-child-recovery-panel';
import{useReadLifetime}from'@/hooks/use-read-lifetime';
import{hrReadIdentity}from'@/lib/reads/hr-read-identity';
import {hrPayrollReadIdentity, hasPayrollReadCapability} from "@/lib/reads/hr-payroll-records-schema";
import {hasPermission} from "@/lib/rbac/scope";

/**
 * ERP HR.5 — Employee Payroll & WPS Tab
 *
 * 5 sections:
 *   1. Salary Profile
 *   2. Salary Components
 *   3. Salary Revision History (append-only)
 *   4. WPS / Bank Details
 *   5. Payroll Holds
 *
 * Security:
 *   - Tab content hidden unless user has hr.payroll.view
 *   - Mutation buttons hidden unless user has hr.payroll.manage
 *   - IBAN/account always masked
 *   - Salary amounts redacted server-side for unauthorized
 *   - No workspace draft for payroll sensitive fields
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getWpsReadinessBadgeVariant,
  getWpsReadinessLabel,
} from "@/lib/hr/payroll/wps-readiness";
import {
  invalidateHrEmployeePayroll,
  invalidateHrEmployeePayrollHolds,
  invalidateHrEmployeeSalaryComponents,
  invalidateHrEmployeeSalaryRevisions,
  invalidateHrEmployeeWps,
} from "@/lib/query/invalidation";
import type { AuthContext } from "@/lib/rbac/check";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle,
  Archive, CheckCircle,
  DollarSign,
  Edit2,
  EyeOff,
  History, Landmark,
  Lock,
  PauseCircle,
  Plus
} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";
import { toast } from "sonner";

// ── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  employeeId: number;
  authContext: AuthContext;
  onChildOpen?: (open: boolean) => void;
};

// ── Permission helper ──────────────────────────────────────────────────────────

function checkPerm(ctx: AuthContext, code: string): boolean {
  return hasPermission(ctx, code);
}

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return d; }
}

function fmtMoney(amount: number | null | undefined, currency = "AED"): string {
  if (amount === null || amount === undefined) return "*** Restricted ***";
  return `${currency} ${amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function payrollStatusBadgeVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active": return "default";
    case "hold": return "secondary";
    case "inactive": return "outline";
    default: return "outline";
  }
}

// ── Main Tab Component ─────────────────────────────────────────────────────────

export function EmployeePayrollTab({ employeeId, authContext, onChildOpen }: Props) {
  const identity = hrPayrollReadIdentity(authContext), qc = useQueryClient(), previous = useRef(identity);
  useEffect(() => {
    if (previous.current !== identity) {
      const retired = previous.current;
      const filters = {queryKey: ["hr"], predicate: (query: {queryKey: readonly unknown[]}) => (query.queryKey[1] === "payroll" || query.queryKey.includes("payroll-picker")) && query.queryKey.includes(retired)};
      void qc.cancelQueries(filters); qc.removeQueries(filters); previous.current = identity;
    }
  }, [identity, qc]);
  return <PayrollSession key={`${employeeId}:${identity}`} employeeId={employeeId} authContext={authContext} onChildOpen={onChildOpen} identity={identity} />;
}
function PayrollSession({employeeId, authContext, onChildOpen, identity}: Props & {identity: string}) {
  const [denied, setDenied] = useState(false), qc = useQueryClient();
  const onDenied = useCallback(() => setDenied(true), []);
  useEffect(() => () => onChildOpen?.(false), [onChildOpen]);
  useEffect(() => {
    if (denied) {
      const filters = {queryKey: ["hr"], predicate: (query: {queryKey: readonly unknown[]}) => (query.queryKey[1] === "payroll" || query.queryKey.includes("payroll-picker")) && query.queryKey.includes(identity)};
      void qc.cancelQueries(filters); qc.removeQueries(filters); onChildOpen?.(false);
    }
  }, [denied, identity, qc, onChildOpen]);
  const canView = hasPayrollReadCapability(authContext, "hr.payroll.view");
  const canManage = checkPerm(authContext, "hr.payroll.manage");

  if (!canView || denied) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <Lock className="h-8 w-8" />
        <p className="text-sm font-medium">Payroll information is restricted.</p>
        <p className="text-xs">You need the <code className="bg-muted px-1 rounded">hr.payroll.view</code> permission to access this tab.</p>
      </div>
    );
  }

  return (
    <PayrollReadScope identity={identity} onDenied={onDenied}><div className="space-y-6 p-6">
      <HrChildRecoveryPanel authContext={authContext}/>
      <SalaryProfileSection employeeId={employeeId} authContext={authContext} canManage={canManage} onChildOpen={onChildOpen} />
      <SalaryComponentsSection employeeId={employeeId} authContext={authContext} canManage={canManage} onChildOpen={onChildOpen} />
      <SalaryRevisionSection employeeId={employeeId} authContext={authContext} canManage={canManage} onChildOpen={onChildOpen} />
      {hasPayrollReadCapability(authContext, "hr.banking.view") ? <WpsSection employeeId={employeeId} authContext={authContext} canManage={canManage && checkPerm(authContext, "hr.banking.manage")} onChildOpen={onChildOpen} /> : <p role="status">WPS and banking details are restricted. Separate banking access is required.</p>}
      <PayrollHoldsSection employeeId={employeeId} authContext={authContext} canManage={canManage} onChildOpen={onChildOpen} />
    </div></PayrollReadScope>
  );
}

// ── 1. Salary Profile Section ──────────────────────────────────────────────────

function SalaryProfileSection({employeeId,authContext,canManage,onChildOpen}:{employeeId:number;authContext:AuthContext;canManage:boolean;onChildOpen?:(open:boolean)=>void}){
 const qc=useQueryClient(),scope=usePayrollReadScope(),owner=useReadLifetime(`f11-payroll-profile:${employeeId}:${hrReadIdentity(authContext)}`);
 const[dialogOpen,setDialogOpenRaw]=useState(false),[target,setTarget]=useState<{id:number|null;action:'create'|'update'|'archive'|'release'}>({id:null,action:'create'});
 const uiRead1=usePayrollPoint('profile',employeeId),uiRead2=usePayrollPoint('salary-totals',employeeId),{data:profile,isLoading}=uiRead1,{data:grossRes}=uiRead2,profileData=profile?.data??null,gross=grossRes?.data?.gross??null,currency=profileData?.currency??'AED';
 const setDialogOpen=(open:boolean)=>{if(!owner.active)return;setDialogOpenRaw(open);onChildOpen?.(open);};
 const openTarget=(id:number|null,action:'create'|'update'|'archive'|'release')=>{if(!owner.active||!canManage||!uiRead1.canDispatch()||dialogOpen)return;setTarget({id,action});setDialogOpen(true);};
 const openEdit=()=>openTarget(profileData?.id??null,profileData?'update':'create');


 return <>
    <QueryReadBoundary queries={[uiRead1,uiRead2]}><div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">Salary Profile</h3>
          {profileData && (
            <Badge variant={payrollStatusBadgeVariant(profileData.payroll_status)} className="capitalize">
              {profileData.payroll_status}
            </Badge>
          )}
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={openEdit} disabled={uiRead1.isFetching || uiRead2.isFetching}>
            <Edit2 className="h-3.5 w-3.5 mr-1.5" />
            {profileData ? "Edit Profile" : "Setup Profile"}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
      ) : profileData ? (
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div><span className="text-muted-foreground">Payroll Group:</span> <span className="font-medium">{profileData.payroll_group?.name_en ?? "—"}</span></div>
          <div><span className="text-muted-foreground">Effective Date:</span> <span className="font-medium">{fmtDate(profileData.effective_date)}</span></div>
          <div><span className="text-muted-foreground">Currency:</span> <span className="font-medium">{profileData.currency}</span></div>
          <div><span className="text-muted-foreground">Calculated Gross:</span> <span className="font-medium text-green-700">{uiRead2.isError ? "Salary unavailable" : uiRead2.isLoading || uiRead2.isFetching ? "Loading salary…" : fmtMoney(gross, currency)}</span></div>
          {profileData.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> <span>{profileData.notes}</span></div>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No payroll profile configured yet.</p>
      )}


    </div></QueryReadBoundary>
 {dialogOpen&&<PayrollRecordEditor kind="payroll-profile"employeeId={employeeId}authContext={authContext}target={target}canDispatch={()=>owner.active&&canManage&&uiRead1.canDispatch()&&uiRead2.canDispatch()}blocked={!canManage||!uiRead1.ready||!uiRead2.ready}retry={()=>{void uiRead1.refetch();void uiRead2.refetch();}}onDenied={scope.onDenied}onClose={()=>setDialogOpen(false)}onSaved={()=>{if(!owner.active)return;invalidateHrEmployeePayroll(qc,employeeId);toast.success('Payroll change saved');}}/>}
 </>;
}

// ── 2. Salary Components Section ───────────────────────────────────────────────


function SalaryComponentsSection({employeeId,authContext,canManage,onChildOpen}:{employeeId:number;authContext:AuthContext;canManage:boolean;onChildOpen?:(open:boolean)=>void}){
 const qc=useQueryClient(),scope=usePayrollReadScope(),owner=useReadLifetime(`f11-salary-component:${employeeId}:${hrReadIdentity(authContext)}`);
 const[dialogOpen,setDialogOpenRaw]=useState(false),[target,setTarget]=useState<{id:number|null;action:'create'|'update'|'archive'|'release'}>({id:null,action:'create'});
 const uiRead1=usePayrollRecords('salary-components',employeeId),{data:compsRes}=uiRead1,components=Array.isArray(compsRes?.data)?compsRes.data:[];
 const setDialogOpen=(open:boolean)=>{if(!owner.active)return;setDialogOpenRaw(open);onChildOpen?.(open);};
 const openTarget=(id:number|null,action:'create'|'update'|'archive'|'release')=>{if(!owner.active||!canManage||!uiRead1.canDispatch()||dialogOpen)return;setTarget({id,action});setDialogOpen(true);};
 const openAdd=()=>openTarget(null,'create'),openEdit=(record:{id:number})=>{if(components.some(row=>row.id===record.id))openTarget(record.id,'update');},handleArchive=(id:number)=>{if(components.some(row=>row.id===id))openTarget(id,'archive');};


 return <>
    <QueryReadBoundary queries={[uiRead1]}><div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">Salary Components</h3>
          <Badge variant="outline">{uiRead1.collection.serverRead.totalCount ?? "…"}</Badge>
        </div>
        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Component
          </Button>
        )}
      </div>

        <div className="divide-y text-sm">
          <RecordCollection presentation="embedded" {...uiRead1.collection} id="hr.employee-payroll-tab.SalaryComponentsSection.components" rows={components} fields={[{"id":"component_type_name_en","path":"component_type.name_en","label":"Component"},{"id":"effective_from","path":"effective_from","label":"Effective From"},{"id":"effective_to","path":"effective_to","label":"Effective To"}]} renderRecord={(comp) => (
            <div key={comp.id} className="flex items-center justify-between py-2.5 gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{comp.component_type?.name_en ?? `Type #${comp.component_type_id}`}</span>
                  <Badge variant={comp.component_type?.component_kind === "earning" ? "default" : "secondary"} className="text-xs capitalize">
                    {comp.component_type?.component_kind ?? "earning"}
                  </Badge>
                  {!comp.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  {fmtDate(comp.effective_from)} — {comp.effective_to ? fmtDate(comp.effective_to) : "ongoing"}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-green-700">{fmtMoney(comp.amount)}</div>
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" disabled={uiRead1.detailPending} onClick={() => void openEdit(comp)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleArchive(comp.id)}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )} />
        </div>


    </div></QueryReadBoundary>
 {dialogOpen&&<PayrollRecordEditor kind="salary-component"employeeId={employeeId}authContext={authContext}target={target}canDispatch={()=>owner.active&&canManage&&uiRead1.canDispatch()}blocked={!canManage||!uiRead1.ready}retry={()=>{void uiRead1.refetch();}}onDenied={scope.onDenied}onClose={()=>setDialogOpen(false)}onSaved={()=>{if(!owner.active)return;invalidateHrEmployeeSalaryComponents(qc,employeeId);toast.success('Payroll change saved');}}/>}
 </>;
}

// ── 3. Salary Revision History Section ────────────────────────────────────────

function SalaryRevisionSection({employeeId,authContext,canManage,onChildOpen}:{employeeId:number;authContext:AuthContext;canManage:boolean;onChildOpen?:(open:boolean)=>void}){
 const qc=useQueryClient(),scope=usePayrollReadScope(),owner=useReadLifetime(`f11-salary-revision:${employeeId}:${hrReadIdentity(authContext)}`);
 const[dialogOpen,setDialogOpenRaw]=useState(false),[target,setTarget]=useState<{id:number|null;action:'create'|'update'|'archive'|'release'}>({id:null,action:'create'});
 const uiRead1=usePayrollRecords('salary-revisions',employeeId),{data:revisionsRes}=uiRead1,uiRead2=usePayrollPoint('salary-totals',employeeId,dialogOpen),revisions=Array.isArray(revisionsRes?.data)?revisionsRes.data:[];
 const setDialogOpen=(open:boolean)=>{if(!owner.active)return;setDialogOpenRaw(open);onChildOpen?.(open);};
 const openTarget=(id:number|null,action:'create'|'update'|'archive'|'release')=>{if(!owner.active||!canManage||!uiRead1.canDispatch()||dialogOpen)return;setTarget({id,action});setDialogOpen(true);};
 const openAdd=()=>openTarget(null,'create');


 return <>
    <QueryReadBoundary queries={[uiRead1,uiRead2]}><div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">Salary Revision History</h3>
          <Badge variant="outline">{uiRead1.collection.serverRead.totalCount ?? "…"}</Badge>
        </div>
        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Record Revision
          </Button>
        )}
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Lock className="h-3 w-3" /> Append-only history — records cannot be edited or deleted.
      </div>

        <div className="divide-y text-sm">
          <RecordCollection presentation="embedded" {...uiRead1.collection} id="hr.employee-payroll-tab.SalaryRevisionSection.revisions" rows={revisions} fields={[{"id":"effective_date","path":"effective_date","label":"Effective Date"},{"id":"revision_reason","path":"revision_reason","label":"Revision Reason"}]} renderRecord={(rev) => (
            <div key={rev.id} className="py-2.5 grid grid-cols-4 gap-2">
              <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{fmtDate(rev.effective_date)}</span></div>
              <div><span className="text-muted-foreground">Old Basic:</span> <span>{fmtMoney(rev.old_gross)}</span></div>
              <div><span className="text-muted-foreground">New Basic:</span> <span className="text-green-700 font-semibold">{fmtMoney(rev.new_gross)}</span></div>
              <div><span className="text-muted-foreground">By:</span> <span>{rev.creator?.display_name ?? rev.approver?.display_name ?? "—"}</span></div>
              {rev.revision_reason && <div className="col-span-4 text-muted-foreground">{rev.revision_reason}</div>}
            </div>
          )} />
        </div>


    </div></QueryReadBoundary>
 {dialogOpen&&<PayrollRecordEditor kind="salary-revision"currentBasic={uiRead2.data?.success?uiRead2.data.data?.basic??null:null}employeeId={employeeId}authContext={authContext}target={target}canDispatch={()=>owner.active&&canManage&&uiRead1.canDispatch()&&uiRead2.canDispatch()}blocked={!canManage||!uiRead1.ready||!uiRead2.ready}retry={()=>{void uiRead1.refetch();void uiRead2.refetch();}}onDenied={scope.onDenied}onClose={()=>setDialogOpen(false)}onSaved={(_receipt,request)=>{if(!owner.active)return;invalidateHrEmployeeSalaryRevisions(qc,employeeId);if(request.values.apply_to_components===true)invalidateHrEmployeePayroll(qc,employeeId);toast.success('Payroll change saved');}}/>}
 </>;
}

// ── 4. WPS / Bank Details Section ─────────────────────────────────────────────

function WpsSection({employeeId,authContext,canManage,onChildOpen}:{employeeId:number;authContext:AuthContext;canManage:boolean;onChildOpen?:(open:boolean)=>void}){
 const qc=useQueryClient(),scope=usePayrollReadScope(),owner=useReadLifetime(`f11-wps-profile:${employeeId}:${hrReadIdentity(authContext)}`);
 const[dialogOpen,setDialogOpenRaw]=useState(false),[target,setTarget]=useState<{id:number|null;action:'create'|'update'|'archive'|'release'}>({id:null,action:'create'});
 const uiRead1=usePayrollPoint('wps',employeeId),{data:wpsRes,isLoading}=uiRead1,wps=wpsRes?.data?.profile??null,readiness=wpsRes?.data?.readiness??null;
 const setDialogOpen=(open:boolean)=>{if(!owner.active)return;setDialogOpenRaw(open);onChildOpen?.(open);};
 const openTarget=(id:number|null,action:'create'|'update'|'archive'|'release')=>{if(!owner.active||!canManage||!uiRead1.canDispatch()||dialogOpen)return;setTarget({id,action});setDialogOpen(true);};
 const openEdit=()=>openTarget(wps?.id??null,wps?'update':'create');

   const wpsStatusVariant = (status: string | null): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case "active": return "default";
      case "hold": return "secondary";
      case "exempt": return "outline";
      default: return "outline";
    }
  };


 return <>
    <QueryReadBoundary queries={[uiRead1]}><div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">WPS / Bank Details</h3>
          {wps && <Badge variant={wpsStatusVariant(wps.wps_status)} className="capitalize">{wps.wps_status}</Badge>}
          {readiness && (
            <Badge variant={getWpsReadinessBadgeVariant(readiness.status)}>
              {getWpsReadinessLabel(readiness.status)}
            </Badge>
          )}
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={openEdit} disabled={uiRead1.isFetching}>
            <Edit2 className="h-3.5 w-3.5 mr-1.5" />
            {wps ? "Edit WPS Profile" : "Setup WPS Profile"}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
      ) : wps ? (
        <>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div><span className="text-muted-foreground">WPS Applicable:</span> <span className="font-medium">{wps.wps_applicable ? "Yes" : "No"}</span></div>
            <div><span className="text-muted-foreground">Payment Method:</span> <span className="font-medium capitalize">{wps.salary_payment_method?.replace("_", " ")}</span></div>
            <div><span className="text-muted-foreground">Bank:</span> <span className="font-medium">{wps.bank?.bank_name_en ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Account Holder:</span> <span className="font-medium">{wps.account_holder_name ?? "—"}</span></div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">IBAN:</span>
              <span className="font-mono font-medium">{wps.iban_masked || "—"}</span>
              <EyeOff className="h-3 w-3 text-muted-foreground ml-1" aria-label="IBAN is always masked" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Account No:</span>
              <span className="font-mono font-medium">{wps.account_number_masked || "—"}</span>
              <EyeOff className="h-3 w-3 text-muted-foreground ml-1" />
            </div>
            {wps.labour_card_number && <div><span className="text-muted-foreground">Labour Card:</span> <span className="font-medium">{wps.labour_card_number}</span></div>}
            {wps.mohre_person_code && <div><span className="text-muted-foreground">MOHRE Code:</span> <span className="font-medium">{wps.mohre_person_code}</span></div>}
          </div>
          {readiness && readiness.missingRequirements.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
              <div className="font-medium flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Missing requirements:</div>
              <ul className="list-disc list-inside space-y-0.5">
                {readiness.missingRequirements.map((req, i) => <li key={i}>{req}</li>)}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground italic">No WPS profile configured yet.</p>
      )}


    </div></QueryReadBoundary>
 {dialogOpen&&<PayrollRecordEditor kind="wps-profile"employeeId={employeeId}authContext={authContext}target={target}canDispatch={()=>owner.active&&canManage&&uiRead1.canDispatch()}blocked={!canManage||!uiRead1.ready}retry={()=>{void uiRead1.refetch();}}onDenied={scope.onDenied}onClose={()=>setDialogOpen(false)}onSaved={()=>{if(!owner.active)return;invalidateHrEmployeeWps(qc,employeeId);toast.success('Payroll change saved');}}/>}
 </>;
}

// ── 5. Payroll Holds Section ───────────────────────────────────────────────────

function PayrollHoldsSection({employeeId,authContext,canManage,onChildOpen}:{employeeId:number;authContext:AuthContext;canManage:boolean;onChildOpen?:(open:boolean)=>void}){
 const qc=useQueryClient(),scope=usePayrollReadScope(),owner=useReadLifetime(`f11-payroll-hold:${employeeId}:${hrReadIdentity(authContext)}`);
 const[dialogOpen,setDialogOpenRaw]=useState(false),[target,setTarget]=useState<{id:number|null;action:'create'|'update'|'archive'|'release'}>({id:null,action:'create'});
 const uiRead1=usePayrollRecords('holds',employeeId),{data:holdsRes}=uiRead1,holds=Array.isArray(holdsRes?.data)?holdsRes.data:[];
 const setDialogOpen=(open:boolean)=>{if(!owner.active)return;setDialogOpenRaw(open);onChildOpen?.(open);};
 const openTarget=(id:number|null,action:'create'|'update'|'archive'|'release')=>{if(!owner.active||!canManage||!uiRead1.canDispatch()||dialogOpen)return;setTarget({id,action});setDialogOpen(true);};
 const openAdd=()=>openTarget(null,'create'),handleRelease=(id:number)=>{if(holds.some(row=>row.id===id&&row.is_active))openTarget(id,'release');},handleArchive=(id:number)=>{if(holds.some(row=>row.id===id&&!row.is_active))openTarget(id,'archive');};
 const isPending=dialogOpen;

 return <>
    <QueryReadBoundary queries={[uiRead1]}><div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2">
          <PauseCircle className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">Payroll Holds</h3>
          {uiRead1.activeHoldCount !== null && uiRead1.activeHoldCount > 0 && <Badge variant="destructive">{uiRead1.activeHoldCount} Active</Badge>}
          <Badge variant="outline">{uiRead1.collection.serverRead.totalCount ?? "…"} matching holds</Badge>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Place Hold
          </Button>
        )}
      </div>

        <div className="divide-y text-sm">
          <RecordCollection presentation="embedded" {...uiRead1.collection} id="hr.employee-payroll-tab.PayrollHoldsSection.holds" rows={holds} fields={[{"id":"hold_reason","path":"hold_reason","label":"Hold Reason"},{"id":"is_active","path":"is_active","label":"Is Active"},{"id":"hold_date","path":"hold_date","label":"Hold Date"}]} renderRecord={(hold) => (
            <div key={hold.id} className="flex items-start justify-between py-2.5 gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{hold.hold_reason}</span>
                  <Badge variant={hold.is_active ? "destructive" : "outline"} className="text-xs">
                    {hold.is_active ? "Active" : "Released"}
                  </Badge>
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  Placed: {fmtDate(hold.hold_date)}
                  {hold.release_date && ` • Released: ${fmtDate(hold.release_date)}`}
                  {hold.releaser && ` by ${hold.releaser.display_name}`}
                </div>
                {hold.notes && <div className="text-xs text-muted-foreground mt-0.5">{hold.notes}</div>}
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  {hold.is_active && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleRelease(hold.id)} disabled={isPending}>
                      <CheckCircle className="h-3 w-3 mr-1" /> Release
                    </Button>
                  )}
                  {!hold.is_active && (
                    <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleArchive(hold.id)} disabled={isPending}>
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )} />
        </div>


    </div></QueryReadBoundary>
 {dialogOpen&&<PayrollRecordEditor kind="payroll-hold"employeeId={employeeId}authContext={authContext}target={target}canDispatch={()=>owner.active&&canManage&&uiRead1.canDispatch()}blocked={!canManage||!uiRead1.ready}retry={()=>{void uiRead1.refetch();}}onDenied={scope.onDenied}onClose={()=>setDialogOpen(false)}onSaved={(_receipt,request)=>{if(!owner.active)return;if(request.action==='archive')invalidateHrEmployeePayrollHolds(qc,employeeId);else invalidateHrEmployeePayroll(qc,employeeId);toast.success('Payroll change saved');}}/>}
 </>;
}
