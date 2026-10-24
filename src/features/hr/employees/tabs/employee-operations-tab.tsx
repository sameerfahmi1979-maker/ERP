"use client";
import{WorkforceReviewButton}from'../workforce-review';
import {hasHrReadCapability} from "@/lib/reads/hr-read-identity";
import { RecordCollection } from "@/components/erp/table/record-collection";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

/**
 * ERP HR.6 — Employee Operations & Readiness Tab
 *
 * 7 sections:
 *   1. Assignments
 *   2. Site Readiness
 *   3. Role Requirements
 *   4. Operational Blocks
 *   5. Assets
 *   6. PPE
 *   7. Accommodation
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import{RequirementRefreshDialog}from "../requirement-refresh-dialog";
import{SiteReadinessDialog}from "../site-readiness-dialog";
import{HrRecordEditor}from "../hr-record-editor";
import{HrChildRecoveryPanel}from "../hr-child-recovery-panel";
import{useReadLifetime}from "@/hooks/use-read-lifetime";
import{hrReadIdentity}from "@/lib/reads/hr-read-identity";
import { toast } from "sonner";
import {
  MapPin, Briefcase, ShieldCheck, AlertOctagon, Package, HardHat, Home,
  Plus, Edit2, Archive, XCircle, RefreshCw,
  Lock, Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getBlockStatusBadge, getAssignmentStatusBadge, getReadinessStatusBadge } from "@/lib/hr/operations/status";
import type { BlockStatus, AssignmentStatus } from "@/lib/hr/operations/status";
import {
  invalidateHrEmployeeAssignments,
  invalidateHrEmployeeReadiness,
  invalidateHrEmployeeRoleRequirements,
  invalidateHrEmployeeBlocks,
  invalidateHrEmployeeAssets,
  invalidateHrEmployeePpe,
  invalidateHrEmployeeAccommodation,
} from "@/lib/query/invalidation";
import type { AuthContext } from "@/lib/rbac/check";
import { hasPermission } from "@/lib/rbac/scope";
import { hrOperationsReadIdentity } from "@/lib/reads/hr-operations-schema";
import { HR_OPERATION_RECORD_CONFIG, type HrOperationRecordKind } from "@/lib/reads/hr-operation-records-schema";
import { useHrOperationRecords } from "@/hooks/use-hr-operation-records";

// ─── Types ─────────────────────────────────────────────────────────────────

type Props = {
  employeeId: number;
  authContext: AuthContext;
  onChildOpen?: (open: boolean) => void;
};

function checkPerm(ctx: AuthContext, code: string): boolean {
  return hasPermission(ctx, code);
}

// ─── Section Wrapper ────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-base">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Main Tab ──────────────────────────────────────────────────────────────

const OperationsReadIdentity = createContext<{identity: string; onDenied?: () => void}>({identity: ""});
const operationalRecordKinds = new Set(["assignments", "site-readiness", "role-requirements", "blocks", "assets", "ppe", "accommodation"]);

/** Keep existing invalidation prefixes, while giving every section its live
 * principal/scope lifetime. No action, permission or mutation retry changes. */
function useOperationalRecordQuery(kind: HrOperationRecordKind, employeeId: number) {
  const {identity, onDenied} = useContext(OperationsReadIdentity);
  return useHrOperationRecords(kind, employeeId, identity, onDenied);
}

export function EmployeeOperationsTab(props: Props) {
  const { onChildOpen } = props;
  const identity = hrOperationsReadIdentity(props.authContext), qc = useQueryClient(), previous = useRef(identity);
  const [deniedIdentity, setDeniedIdentity] = useState<string | null>(null), denied = deniedIdentity === identity;
  const onDenied = useCallback(() => setDeniedIdentity(identity), [identity]);
  useEffect(() => {
    if (previous.current === identity && !denied) return;
    const retired = previous.current;
    const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === "hr" && query.queryKey[1] === "operations"
      && operationalRecordKinds.has(String(query.queryKey[2])) && typeof query.queryKey[3] === "number" && query.queryKey.at(-1) === retired;
    void qc.cancelQueries({ predicate });
    qc.removeQueries({ predicate });
    previous.current = identity;
    onChildOpen?.(false);
  }, [identity, denied, qc, onChildOpen]);
  return <OperationsReadIdentity.Provider value={{identity, onDenied}}>
    <EmployeeOperationsTabContent key={`${props.employeeId}:${identity}:${denied}`} {...props} denied={denied} />
  </OperationsReadIdentity.Provider>;
}

function EmployeeOperationsTabContent({ employeeId, authContext, onChildOpen, denied }: Props & {denied?: boolean}) {
  const canView = !denied && hasHrReadCapability(authContext, "hr.assignments.view");
  const canManage = checkPerm(authContext, "hr.assignments.manage");

  if (!canView) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Lock className="h-4 w-4" />
        <span>You do not have permission to view operations data.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <HrChildRecoveryPanel authContext={authContext}/>
      <AssignmentsSection employeeId={employeeId} authContext={authContext} canManage={canManage} onChildOpen={onChildOpen} />
      <SiteReadinessSection employeeId={employeeId} authContext={authContext} canManage={canManage} onChildOpen={onChildOpen} />
      <RoleRequirementsSection employeeId={employeeId} authContext={authContext} canManage={canManage} onChildOpen={onChildOpen} />
      <OperationalBlocksSection employeeId={employeeId} authContext={authContext} canManage={canManage} onChildOpen={onChildOpen} />
      <AssetsSection employeeId={employeeId} authContext={authContext} canManage={canManage} onChildOpen={onChildOpen} />
      <PpeSection employeeId={employeeId} authContext={authContext} canManage={canManage} onChildOpen={onChildOpen} />
      <AccommodationSection employeeId={employeeId} authContext={authContext} canManage={canManage} onChildOpen={onChildOpen} />
    </div>
  );
}

// ─── Assignments Section ────────────────────────────────────────────────────

function AssignmentsSection({employeeId,authContext,canManage,onChildOpen}:{employeeId:number;authContext:AuthContext;canManage:boolean;onChildOpen?:(open:boolean)=>void}){
 const qc=useQueryClient(),{onDenied}=useContext(OperationsReadIdentity),owner=useReadLifetime(`assignment:${employeeId}:${hrReadIdentity(authContext)}`);
 const[isOpen,setIsOpenRaw]=useState(false),[target,setTarget]=useState<{id:number;action:'update'|'archive'}|null>(null);
 const uiRead1=useOperationalRecordQuery('assignments',employeeId),{data}=uiRead1,assignments=data?.success?(data.data as Record<string,unknown>[]):[];
 const setIsOpen=(open:boolean)=>{if(!owner.active)return;setIsOpenRaw(open);onChildOpen?.(open);};
 const canDispatch=()=>owner.active&&canManage&&uiRead1.canDispatch();
 const openAdd=()=>{if(!canDispatch())return;setTarget(null);setIsOpen(true);};
 const openRecord=(row:Record<string,unknown>,action:'update'|'archive')=>{if(!canDispatch()||!assignments.some(current=>current.id===row.id))return;setTarget({id:row.id as number,action});setIsOpen(true);};
  return (
    <><QueryReadBoundary queries={[uiRead1]}><Section
      title="Assignments"
      icon={<MapPin className="h-5 w-5 text-primary" />}
      action={canManage ? (
        <Button size="sm" disabled={!uiRead1.ready} onClick={openAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add Assignment
        </Button>
      ) : undefined}
    >
        <div className="divide-y">
          <RecordCollection presentation="embedded" {...uiRead1.collection} id="hr.employee-operations-tab.AssignmentsSection.assignments" rows={assignments} fields={HR_OPERATION_RECORD_CONFIG.assignments.fields.map(f => ({...f, path: f.id === "site_name" ? "work_sites.name_en" : f.id === "department_name" ? "departments.name_en" : f.id === "designation_name" ? "designations.name_en" : f.id}))} renderRecord={(a) => {
            const badge = getAssignmentStatusBadge(a.assignment_status as AssignmentStatus);
            const dept = (a.departments as Record<string, unknown> | null)?.name_en;
            const desg = (a.designations as Record<string, unknown> | null)?.name_en;
            const site = (a.work_sites as Record<string, unknown> | null)?.name_en;
            return (
              <div key={a.id as number} className="flex items-start justify-between py-3 px-1">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <span className="text-xs text-muted-foreground capitalize">{String(a.assignment_type)}</span>
                  </div>
                  <p className="text-sm font-medium">{[dept, desg, site].filter(Boolean).join(" · ") || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(a.effective_from)} {a.effective_to ? `→ ${String(a.effective_to)}` : "→ ongoing"}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-1.5">
                    {a.assignment_status==='planned'&&<WorkforceReviewButton employeeId={employeeId}kind="assignment"sourceId={a.id as number}authContext={authContext}canDispatch={canDispatch}onChildOpen={onChildOpen}onDenied={onDenied}/>}
                    <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openRecord(a,"update")}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openRecord(a,"archive")}>
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          }} />
        </div>


    </Section></QueryReadBoundary>
    {isOpen&&<HrRecordEditor kind="assignment" employeeId={employeeId}authContext={authContext}target={target}canDispatch={canDispatch}onDenied={onDenied}onClose={()=>setIsOpen(false)}admission={{blocked:!canManage||!uiRead1.ready,message:'The current assignment list is unavailable. Your draft is retained; retry before saving.',retry:()=>{void uiRead1.refetch();}}}onSaved={(_receipt,action)=>{if(!owner.active)return;invalidateHrEmployeeAssignments(qc,employeeId);toast.success(action==='archive'?'Archived':action==='update'?'Assignment updated':'Assignment created');}}/>}
    </>
  );
}

// ─── Site Readiness Section ─────────────────────────────────────────────────

function SiteReadinessSection({employeeId,authContext,canManage,onChildOpen}:{employeeId:number;authContext:AuthContext;canManage:boolean;onChildOpen?:(open:boolean)=>void}){
 const qc=useQueryClient(),{onDenied}=useContext(OperationsReadIdentity),owner=useReadLifetime(`readiness-parent:${employeeId}:${hrReadIdentity(authContext)}`);
 const[isOpen,setIsOpenRaw]=useState(false),uiRead1=useOperationalRecordQuery('readiness',employeeId),records=uiRead1.data?.success?(uiRead1.data.data as Record<string,unknown>[]):[];
 const setIsOpen=(open:boolean)=>{if(!owner.active)return;setIsOpenRaw(open);onChildOpen?.(open);};
 const canDispatch=()=>owner.active&&canManage&&uiRead1.canDispatch();
 return <><QueryReadBoundary queries={[uiRead1]}><Section title="Site Readiness"icon={<ShieldCheck className="h-5 w-5 text-primary"/>}action={canManage?<Button size="sm"disabled={!uiRead1.ready}onClick={()=>{if(canDispatch())setIsOpen(true);}}><RefreshCw className="h-3.5 w-3.5 mr-1"/>Check Readiness</Button>:undefined}>
  <p className="text-xs text-muted-foreground">Saved calculations are history, not current deployment approval. Recheck current evidence, rules and restrictions before assignment.</p>
  <RecordCollection presentation="embedded" {...uiRead1.collection}id="hr.employee-operations-tab.SiteReadinessSection.records"rows={records}fields={HR_OPERATION_RECORD_CONFIG.readiness.fields.map(f=>({...f,path:f.id==='site_name'?'work_sites.name_en':f.id}))}renderRecord={r=>{const badge=getReadinessStatusBadge(r.readiness_status as string),site=(r.work_sites as Record<string,unknown>|null)?.name_en;return <div className="flex items-start justify-between py-3 px-1"><div className="space-y-1"><div className="flex items-center gap-2"><Badge variant={badge.variant}>{badge.label}</Badge><span className="text-sm font-medium">{String(site??'Unknown site')}</span></div><p className="text-xs text-muted-foreground">Checked: {String(r.checked_at??'—').slice(0,10)}</p></div></div>;}}/>
 </Section></QueryReadBoundary>{isOpen&&<SiteReadinessDialog employeeId={employeeId}authContext={authContext}canDispatch={canDispatch}blocked={!canManage||!uiRead1.ready}retry={()=>{void uiRead1.refetch();}}onDenied={onDenied}onClose={()=>setIsOpen(false)}onSaved={()=>{if(!owner.active)return;invalidateHrEmployeeReadiness(qc,employeeId);toast.success('Readiness calculation saved');}}/>}</>;
}

// ─── Role Requirements Section ──────────────────────────────────────────────

function RoleRequirementsSection({employeeId,authContext,canManage,onChildOpen}:{employeeId:number;authContext:AuthContext;canManage:boolean;onChildOpen?:(open:boolean)=>void}){
 const qc=useQueryClient(),{onDenied}=useContext(OperationsReadIdentity),owner=useReadLifetime(`role-requirement:${employeeId}:${hrReadIdentity(authContext)}`);
 const[isOpen,setIsOpenRaw]=useState(false),[refreshOpen,setRefreshOpenRaw]=useState(false),[target,setTarget]=useState<{id:number;action:'update'|'waive'|'archive'}|null>(null);
 const uiRead1=useOperationalRecordQuery('requirements',employeeId),{data}=uiRead1,reqs=data?.success?(data.data as Record<string,unknown>[]):[];
 const canDispatch=()=>owner.active&&canManage&&uiRead1.canDispatch();
 const setIsOpen=(open:boolean)=>{if(!owner.active)return;setIsOpenRaw(open);onChildOpen?.(open);};
 const setRefreshOpen=(open:boolean)=>{if(!owner.active)return;setRefreshOpenRaw(open);onChildOpen?.(open);};
 const openAdd=()=>{if(!canDispatch())return;setTarget(null);setIsOpen(true);};
 const openRecord=(row:Record<string,unknown>,action:'update'|'waive'|'archive')=>{if(!canDispatch()||!reqs.some(current=>current.id===row.id))return;setTarget({id:row.id as number,action});setIsOpen(true);};
  const statusColors: Record<string, string> = {
    met: "text-green-600",
    missing: "text-destructive",
    expired: "text-destructive",
    expiring_soon: "text-amber-600",
    waived: "text-muted-foreground",
    not_required: "text-muted-foreground",
  };

 return <><QueryReadBoundary queries={[uiRead1]}><Section title="Role Requirements"icon={<Briefcase className="h-5 w-5 text-primary"/>}action={canManage?<div className="flex gap-2"><Button size="sm"variant="outline"disabled={!uiRead1.ready}onClick={()=>{if(canDispatch())setRefreshOpen(true);}}><RefreshCw className="h-3.5 w-3.5 mr-1"/>Recalculate</Button><Button size="sm"disabled={!uiRead1.ready}onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1"/>Add Requirement</Button></div>:undefined}>
        <p className="text-xs text-muted-foreground">These are recorded requirement statuses. Current evidence and dated, source-valid waivers are revalidated separately; a saved “waived” label alone does not grant an exemption.</p>
        <div className="divide-y">
          <RecordCollection presentation="embedded" {...uiRead1.collection} id="hr.employee-operations-tab.RoleRequirementsSection.reqs" rows={reqs} fields={HR_OPERATION_RECORD_CONFIG.requirements.fields.map(f => ({...f}))} renderRecord={(r) => (
            <div key={r.id as number} className="flex items-start justify-between py-3 px-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold uppercase ${statusColors[r.status as string] ?? ""}`}>{String(r.status)}</span>
                  <span className="text-xs text-muted-foreground capitalize">{String(r.requirement_type)}</span>
                </div>
                <p className="text-sm font-medium">{String(r.requirement_name)}</p>
                {r.expiry_date ? <p className="text-xs text-muted-foreground">Expires: {String(r.expiry_date)}</p> : null}
              </div>
              {canManage && (
                <div className="flex gap-1.5">
                  <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openRecord(r,'update')}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <WorkforceReviewButton employeeId={employeeId}kind="role-requirement"sourceId={r.id as number}authContext={authContext}canDispatch={canDispatch}onChildOpen={onChildOpen}onDenied={onDenied}/>
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openRecord(r,'archive')}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>

 </Section></QueryReadBoundary>
 {isOpen&&<HrRecordEditor kind="role-requirement"employeeId={employeeId}authContext={authContext}target={target}canDispatch={canDispatch}onDenied={onDenied}onClose={()=>setIsOpen(false)}admission={{blocked:!canManage||!uiRead1.ready,message:'The current requirement list is unavailable. Your draft is retained; retry before saving.',retry:()=>{void uiRead1.refetch();}}}onSaved={(_receipt,action)=>{if(!owner.active)return;invalidateHrEmployeeRoleRequirements(qc,employeeId);toast.success(action==='waive'?'Requirement waived':action==='archive'?'Requirement archived':action==='update'?'Requirement updated':'Requirement created');}}/>}
 {refreshOpen&&<RequirementRefreshDialog employeeId={employeeId}authContext={authContext}canDispatch={canDispatch}blocked={!canManage||!uiRead1.ready}retry={()=>{void uiRead1.refetch();}}onDenied={onDenied}onClose={()=>setRefreshOpen(false)}onSaved={()=>{if(!owner.active)return;invalidateHrEmployeeRoleRequirements(qc,employeeId);toast.success('Requirements recalculated');}}/>}
 </>;
}

// ─── Operational Blocks Section ─────────────────────────────────────────────

function OperationalBlocksSection({employeeId,authContext,canManage,onChildOpen}:{employeeId:number;authContext:AuthContext;canManage:boolean;onChildOpen?:(open:boolean)=>void}){
 const qc=useQueryClient(),{onDenied}=useContext(OperationsReadIdentity),owner=useReadLifetime(`operational-block:${employeeId}:${hrReadIdentity(authContext)}`);
 const[isOpen,setIsOpenRaw]=useState(false),[target,setTarget]=useState<{id:number;action:'release'|'archive'}|null>(null);
 const uiRead1=useOperationalRecordQuery('blocks',employeeId),{data}=uiRead1,blocks=data?.success?(data.data as Record<string,unknown>[]):[];
 const setIsOpen=(open:boolean)=>{if(!owner.active)return;setIsOpenRaw(open);onChildOpen?.(open);};
 const canDispatch=()=>owner.active&&canManage&&uiRead1.canDispatch();
 const openAdd=()=>{if(!canDispatch())return;setTarget(null);setIsOpen(true);};
 const openRecord=(row:Record<string,unknown>,action:'release'|'archive')=>{if(!canDispatch()||!blocks.some(current=>current.id===row.id))return;setTarget({id:row.id as number,action});setIsOpen(true);};
 return <><QueryReadBoundary queries={[uiRead1]}><Section title="Operational Blocks" icon={<AlertOctagon className="h-5 w-5 text-destructive"/>} action={canManage?<Button size="sm" variant="destructive"disabled={!uiRead1.ready}onClick={openAdd}><Flag className="h-3.5 w-3.5 mr-1"/>Add Block</Button>:undefined}>
        <div className="divide-y">
          <RecordCollection presentation="embedded" {...uiRead1.collection} id="hr.employee-operations-tab.OperationalBlocksSection.blocks" rows={blocks} fields={HR_OPERATION_RECORD_CONFIG.blocks.fields.map(f => ({...f}))} renderRecord={(b) => {
            const badge = getBlockStatusBadge(b.block_status as BlockStatus);
            return (
              <div key={b.id as number} className="flex items-start justify-between py-3 px-1">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <span className="text-xs text-muted-foreground capitalize">{String(b.block_type).replace(/_/g, " ")}</span>
                  </div>
                  <p className="text-sm">{String(b.block_reason)}</p>
                  <p className="text-xs text-muted-foreground">
                    From: {String(b.effective_from)}{b.effective_to ? ` → ${String(b.effective_to)}` : ""}
                  </p>
                </div>
                {canManage && b.block_status === "active" && (
                  <Button size="sm" variant="outline" onClick={() => openRecord(b,'release')}>
                    <XCircle className="h-3.5 w-3.5 mr-1" />Release
                  </Button>
                )}
              </div>
            );
          }} />
        </div>

 </Section></QueryReadBoundary>
 {isOpen&&<HrRecordEditor kind="operational-block"employeeId={employeeId}authContext={authContext}target={target}canDispatch={canDispatch}onDenied={onDenied}onClose={()=>setIsOpen(false)}admission={{blocked:!canManage||!uiRead1.ready,message:'The current block list is unavailable. Your draft is retained; retry before saving.',retry:()=>{void uiRead1.refetch();}}}onSaved={(_receipt,action)=>{if(!owner.active)return;invalidateHrEmployeeBlocks(qc,employeeId);toast.success(action==='release'?'Block released':action==='archive'?'Block archived':'Operational block created');}}/>}
 </>;
}

// ─── Assets Section ─────────────────────────────────────────────────────────

function AssetsSection({employeeId,authContext,canManage,onChildOpen}:{employeeId:number;authContext:AuthContext;canManage:boolean;onChildOpen?:(open:boolean)=>void}){
 const qc=useQueryClient(),{onDenied}=useContext(OperationsReadIdentity),owner=useReadLifetime(`asset:${employeeId}:${hrReadIdentity(authContext)}`);
 const[isOpen,setIsOpenRaw]=useState(false),[target,setTarget]=useState<{id:number;action:'update'|'archive'|'return'}|null>(null);
 const uiRead1=useOperationalRecordQuery('assets',employeeId),{data}=uiRead1,assets=data?.success?(data.data as Record<string,unknown>[]):[];
 const setIsOpen=(open:boolean)=>{if(!owner.active)return;setIsOpenRaw(open);onChildOpen?.(open);};
 const canDispatch=()=>owner.active&&canManage&&uiRead1.canDispatch();
 const openAdd=()=>{if(!canDispatch())return;setTarget(null);setIsOpen(true);};
 const openRecord=(row:Record<string,unknown>,action:'update'|'archive'|'return')=>{if(!canDispatch()||!assets.some(current=>current.id===row.id))return;setTarget({id:row.id as number,action});setIsOpen(true);};
  return (
    <><QueryReadBoundary queries={[uiRead1]}><Section
      title="Assets"
      icon={<Package className="h-5 w-5 text-primary" />}
      action={canManage ? <Button size="sm" disabled={!uiRead1.ready} onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" />Issue Asset</Button> : undefined}
    >
        <div className="divide-y">
          <RecordCollection presentation="embedded" {...uiRead1.collection} id="hr.employee-operations-tab.AssetsSection.assets" rows={assets} fields={HR_OPERATION_RECORD_CONFIG.assets.fields.map(f => ({...f}))} renderRecord={(a) => (
            <div key={a.id as number} className="flex items-start justify-between py-3 px-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={a.status === "issued" ? "default" : "outline"}>{String(a.status)}</Badge>
                  <span className="text-xs text-muted-foreground capitalize">{String(a.asset_type).replace(/_/g, " ")}</span>
                </div>
                <p className="text-sm font-medium">{String(a.asset_description)}</p>
                {a.asset_reference ? <p className="text-xs text-muted-foreground">Ref: {String(a.asset_reference)}</p> : null}
                <p className="text-xs text-muted-foreground">Issued: {String(a.issued_date)}</p>
              </div>
              {canManage && (
                <div className="flex gap-1.5">
                  <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openRecord(a,"update")}><Edit2 className="h-3.5 w-3.5" /></Button>
                  {a.status === "issued" ? (
                    <Button size="sm" variant="outline" onClick={() => openRecord(a,"return")}>Return</Button>
                  ) : null}
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openRecord(a,"archive")}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>


    </Section></QueryReadBoundary>
    {isOpen&&<HrRecordEditor kind="asset"employeeId={employeeId}authContext={authContext}target={target}canDispatch={canDispatch}onDenied={onDenied}onClose={()=>setIsOpen(false)}admission={{blocked:!canManage||!uiRead1.ready,message:'The current assets list is unavailable. Your draft is retained; retry before saving.',retry:()=>{void uiRead1.refetch();}}}onSaved={(_receipt,action)=>{if(!owner.active)return;invalidateHrEmployeeAssets(qc,employeeId);const messages:Record<string,string>={create:'Asset issued',update:'Asset updated',return:'Asset returned',archive:'Asset archived'};toast.success(messages[action]??'Record saved');}}/>}
    </>
  );
}

// ─── PPE Section ────────────────────────────────────────────────────────────

function PpeSection({employeeId,authContext,canManage,onChildOpen}:{employeeId:number;authContext:AuthContext;canManage:boolean;onChildOpen?:(open:boolean)=>void}){
 const qc=useQueryClient(),{onDenied}=useContext(OperationsReadIdentity),owner=useReadLifetime(`ppe:${employeeId}:${hrReadIdentity(authContext)}`);
 const[isOpen,setIsOpenRaw]=useState(false),[target,setTarget]=useState<{id:number;action:'update'|'archive'|'return'}|null>(null);
 const uiRead1=useOperationalRecordQuery('ppe',employeeId),{data}=uiRead1,ppe=data?.success?(data.data as Record<string,unknown>[]):[];
 const setIsOpen=(open:boolean)=>{if(!owner.active)return;setIsOpenRaw(open);onChildOpen?.(open);};
 const canDispatch=()=>owner.active&&canManage&&uiRead1.canDispatch();
 const openAdd=()=>{if(!canDispatch())return;setTarget(null);setIsOpen(true);};
 const openRecord=(row:Record<string,unknown>,action:'update'|'archive'|'return')=>{if(!canDispatch()||!ppe.some(current=>current.id===row.id))return;setTarget({id:row.id as number,action});setIsOpen(true);};
  return (
    <><QueryReadBoundary queries={[uiRead1]}><Section
      title="PPE Issued"
      icon={<HardHat className="h-5 w-5 text-primary" />}
      action={canManage ? <Button size="sm" disabled={!uiRead1.ready} onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" />Issue PPE</Button> : undefined}
    >
        <div className="divide-y">
          <RecordCollection presentation="embedded" {...uiRead1.collection} id="hr.employee-operations-tab.PpeSection.ppe" rows={ppe} fields={HR_OPERATION_RECORD_CONFIG.ppe.fields.map(f => ({...f}))} renderRecord={(p) => (
            <div key={p.id as number} className="flex items-start justify-between py-3 px-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={p.status === "issued" ? "default" : "outline"}>{String(p.status)}</Badge>
                  {p.standard_or_size ? <span className="text-xs text-muted-foreground">Size: {String(p.standard_or_size)}</span> : null}
                </div>
                <p className="text-sm font-medium">{String(p.ppe_item)}</p>
                <p className="text-xs text-muted-foreground">Qty: {String(p.quantity)} · Issued: {String(p.issued_date)}</p>
                {p.expiry_or_replacement_date ? <p className="text-xs text-muted-foreground">Expiry: {String(p.expiry_or_replacement_date)}</p> : null}
              </div>
              {canManage && (
                <div className="flex gap-1.5">
                  <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openRecord(p,"update")}><Edit2 className="h-3.5 w-3.5" /></Button>
                  {p.status === "issued" ? (
                    <Button size="sm" variant="outline" onClick={() => openRecord(p,"return")}>Return</Button>
                  ) : null}
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openRecord(p,"archive")}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>


    </Section></QueryReadBoundary>
    {isOpen&&<HrRecordEditor kind="ppe"employeeId={employeeId}authContext={authContext}target={target}canDispatch={canDispatch}onDenied={onDenied}onClose={()=>setIsOpen(false)}admission={{blocked:!canManage||!uiRead1.ready,message:'The current ppe list is unavailable. Your draft is retained; retry before saving.',retry:()=>{void uiRead1.refetch();}}}onSaved={(_receipt,action)=>{if(!owner.active)return;invalidateHrEmployeePpe(qc,employeeId);const messages:Record<string,string>={create:'PPE issued',update:'PPE updated',return:'PPE returned',archive:'PPE archived'};toast.success(messages[action]??'Record saved');}}/>}
    </>
  );
}

// ─── Accommodation Section ──────────────────────────────────────────────────

function AccommodationSection({employeeId,authContext,canManage,onChildOpen}:{employeeId:number;authContext:AuthContext;canManage:boolean;onChildOpen?:(open:boolean)=>void}){
 const qc=useQueryClient(),{onDenied}=useContext(OperationsReadIdentity),owner=useReadLifetime(`accommodation:${employeeId}:${hrReadIdentity(authContext)}`);
 const[isOpen,setIsOpenRaw]=useState(false),[target,setTarget]=useState<{id:number;action:'update'|'archive'|'end'}|null>(null);
 const uiRead1=useOperationalRecordQuery('accommodation',employeeId),{data}=uiRead1,records=data?.success?(data.data as Record<string,unknown>[]):[];
 const setIsOpen=(open:boolean)=>{if(!owner.active)return;setIsOpenRaw(open);onChildOpen?.(open);};
 const canDispatch=()=>owner.active&&canManage&&uiRead1.canDispatch();
 const openAdd=()=>{if(!canDispatch())return;setTarget(null);setIsOpen(true);};
 const openRecord=(row:Record<string,unknown>,action:'update'|'archive'|'end')=>{if(!canDispatch()||!records.some(current=>current.id===row.id))return;setTarget({id:row.id as number,action});setIsOpen(true);};
  return (
    <><QueryReadBoundary queries={[uiRead1]}><Section
      title="Accommodation"
      icon={<Home className="h-5 w-5 text-primary" />}
      action={canManage ? <Button size="sm" disabled={!uiRead1.ready} onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" />Assign Accommodation</Button> : undefined}
    >
        <div className="divide-y">
          <RecordCollection presentation="embedded" {...uiRead1.collection} id="hr.employee-operations-tab.AccommodationSection.records" rows={records} fields={HR_OPERATION_RECORD_CONFIG.accommodation.fields.map(f => ({...f}))} renderRecord={(r) => (
            <div key={r.id as number} className="flex items-start justify-between py-3 px-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "active" ? "default" : "outline"}>{String(r.status)}</Badge>
                  {r.accommodation_type ? <span className="text-xs text-muted-foreground capitalize">{String(r.accommodation_type).replace(/_/g, " ")}</span> : null}
                </div>
                <p className="text-sm font-medium">{String(r.accommodation_location ?? "—")}</p>
                {r.room_or_bed_no ? <p className="text-xs text-muted-foreground">Room/Bed: {String(r.room_or_bed_no)}</p> : null}
                <p className="text-xs text-muted-foreground">
                  From: {String(r.assigned_from)} {r.assigned_to ? `→ ${String(r.assigned_to)}` : "→ ongoing"}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-1.5">
                  <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openRecord(r,"update")}><Edit2 className="h-3.5 w-3.5" /></Button>
                  {r.status === "active" ? (
                    <Button size="sm" variant="outline" onClick={() => openRecord(r,"end")}>End</Button>
                  ) : null}
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openRecord(r,"archive")}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>


    </Section></QueryReadBoundary>
    {isOpen&&<HrRecordEditor kind="accommodation"employeeId={employeeId}authContext={authContext}target={target}canDispatch={canDispatch}onDenied={onDenied}onClose={()=>setIsOpen(false)}admission={{blocked:!canManage||!uiRead1.ready,message:'The current accommodation list is unavailable. Your draft is retained; retry before saving.',retry:()=>{void uiRead1.refetch();}}}onSaved={(_receipt,action)=>{if(!owner.active)return;invalidateHrEmployeeAccommodation(qc,employeeId);const messages:Record<string,string>={create:'Accommodation assigned',update:'Accommodation updated',end:'Accommodation ended',archive:'Record archived'};toast.success(messages[action]??'Record saved');}}/>}
    </>
  );
}
