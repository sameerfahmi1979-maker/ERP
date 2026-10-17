"use client";
import {isFinanceSystemAdmin} from '@/lib/master-data/finance-reference-contract';


import { useState, useRef, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@/features/master-data/finance-basics/types";
import type { AuthContext } from "@/lib/rbac/check";
import {hasGlobalPermission} from "@/lib/rbac/scope";
import {createWorkspaceSaveAttempt} from "@/lib/workspace/save-contract";
import {currencySaveReceiptSchema} from "@/lib/master-data/currency-save-receipt";
import {useQueryClient} from "@tanstack/react-query";
import {invalidateCurrencies} from "@/lib/query/invalidation";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  Pencil,
  Power,
  Trash2,
  MoreHorizontal,
  Plus,
  Lock,
  Unlock,
  Shield,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  toggleCurrencyStatus,
  deleteCurrency,
  toggleCurrencyLock,
} from "@/features/master-data/finance-basics/actions";
import { toast } from "sonner";
import { format } from "date-fns";

type CurrenciesTableProps = {
  currencies: Currency[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/finance-basics/currencies";

export function CurrenciesTable({ currencies, authContext, onRefresh }: CurrenciesTableProps) {
  const router = useRouter();
  const queryClient=useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Currency | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [busy,setBusy]=useState(false);
  type Item=Pick<Currency,'id'|'is_active'|'is_locked'|'workspace_revision'>;
  type Action='active'|'lock'|'retire';
  type Pending={item:Item;action:Action;desired:boolean;contract:ReturnType<ReturnType<typeof createWorkspaceSaveAttempt>['begin']>;hadUnknown:boolean};
  const pending=useRef<Pending|null>(null);
  const principal=authContext.profile?.id??null;
  const [scope]=useState(()=>({principal,queryClient}));
  const retired=useRef(false),activation=useRef<{active:boolean}|null>(null);
  const flight=useRef<{lease:{active:boolean};target:Pending}|null>(null);
  const [actionError,setActionError]=useState<string|null>(null);
  const [unconfirmed,setUnconfirmed]=useState(false);
  const [refreshError,setRefreshError]=useState(false);
  const permissions={manage:hasGlobalPermission(authContext,'master_data.finance_basics.manage'),lock:hasGlobalPermission(authContext,'master_data.lookups.lock'),overrideLocked:isFinanceSystemAdmin(authContext),retire:isFinanceSystemAdmin(authContext)};

  const allowed=useRef(permissions);
  useLayoutEffect(()=>{allowed.current=permissions;});
  useLayoutEffect(()=>{
    if(principal!==scope.principal||queryClient!==scope.queryClient)retired.current=true;
    const lease={active:!retired.current};activation.current=lease;
    return ()=>{
      lease.active=false;
      if(flight.current?.lease===lease){flight.current.target.hadUnknown=true;flight.current=null;}
    };
  },[principal,queryClient,scope]);
  const refreshDisplay=(current:()=>boolean,initialFailure=false)=>{
    if(!current())return;
    let failed=initialFailure;
    try{invalidateCurrencies(queryClient);}catch{failed=true;}
    if(!current())return;
    try{if(onRefresh)onRefresh();else router.refresh();}catch{failed=true;}
    if(current())setRefreshError(failed);
  };
  const handleRefresh=()=>{
    const lease=activation.current;
    // Explicit recovery is read-only; it never re-enters changeCurrency.
    refreshDisplay(()=>!!lease?.active&&!retired.current&&activation.current===lease);
  };

  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (item: Currency) => router.push(`${BASE}/record/${item.id}`);
  const handleEdit = (item: Currency) => router.push(`${BASE}/record/${item.id}?mode=edit`);

  const changeCurrency = async (item:Item,action:Action):Promise<boolean> => {
    const lease=activation.current,authority=allowed.current;
    if(!lease?.active||retired.current||flight.current)return false;
    if(action==='lock'?!authority.lock:action==='retire'?!authority.retire:!authority.manage)return false;
    if(action==='active'&&item.is_locked&&!authority.overrideLocked)return false;
    const desired=action==='lock'?!item.is_locked:action==='retire'?false:!item.is_active;
    if(pending.current&&(pending.current.item.id!==item.id||pending.current.action!==action||pending.current.desired!==desired))return false;
    if(!pending.current){
      const snapshot={id:item.id,is_active:item.is_active,is_locked:item.is_locked,workspace_revision:item.workspace_revision};
      const data=action==='lock'?{is_locked:desired}:{is_active:desired};
      try{
        const contract={...createWorkspaceSaveAttempt().begin(data,item.workspace_revision==null?null:String(item.workspace_revision))};
        pending.current={item:snapshot,action,desired,contract,hadUnknown:false};
      }catch{setActionError('The currency change could not be prepared. Reopen this list before continuing.');return false;}
    }
    const target=pending.current,dispatch={lease,target};flight.current=dispatch;
    const current=()=>lease.active&&!retired.current&&activation.current===lease&&flight.current===dispatch;
    setBusy(true);setActionError(null);if(target.action==='retire')setIsDeleting(true);
    try{
      const contract={...target.contract};
      const result=target.action==='lock'?await toggleCurrencyLock(target.item.id,target.desired,contract):target.action==='retire'?await deleteCurrency(target.item.id,contract):await toggleCurrencyStatus({id:target.item.id,is_active:target.desired},contract);
      if(!current())return false;
      const receipt=currencySaveReceiptSchema.safeParse(result.data);
      if(result.success&&(!receipt.success||receipt.data.id!==target.item.id)){
        target.hadUnknown=true;setUnconfirmed(true);setActionError('Currency change unconfirmed. Retry the same action to recover its complete result.');return false;
      }
      if(!result.success){
        target.hadUnknown ||= result.uncertain===true;
        if(!target.hadUnknown)pending.current=null;
        setUnconfirmed(target.hadUnknown);setActionError(target.hadUnknown?'Currency change unconfirmed. Retry the same action to recover its result.':result.error??'The currency change was not saved.');return false;
      }
      // Receipt acknowledgement is terminal before notification, dialog or refresh.
      pending.current=null;setUnconfirmed(false);
      let failed=false;
      try{toast.success(result.data?.changed===false?'No changes to save':target.action==='retire'?'Currency retired; history retained':target.action==='lock'?(target.desired?'Currency locked':'Currency unlocked'):(target.desired?'Currency activated':'Currency deactivated'));}catch{failed=true;}
      if(!current())return true;
      setDeleteDialogOpen(false);setItemToDelete(null);
      refreshDisplay(current,failed);
      return true;
    }catch{
      if(current()){target.hadUnknown=true;setUnconfirmed(true);setActionError('Currency change unconfirmed. Retry the same action to recover its result.');}return false;
    }finally{
      if(current()){flight.current=null;setBusy(false);setIsDeleting(false);}
    }
  };
  const handleToggleActive=(item:Currency)=>changeCurrency(item,'active');
  const handleToggleLock=(item:Currency)=>changeCurrency(item,'lock');

  const handleDeleteClick = (item: Currency) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    const target=pending.current?.action==='retire'?pending.current.item:itemToDelete;
    if (!target) return;
    await changeCurrency(target,'retire');
  };

  const columns: ColumnDef<Currency>[] = [
    {
      accessorKey: "currency_code",
      accessorFn: (row) => `${row.currency_name_en} ${row.currency_code} ${row.symbol || ""}`,
      header: "Currency",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.currency_name_en}</span>
            {row.original.is_system && <Shield className="h-3 w-3 text-amber-600" />}
            {row.original.is_locked && <Lock className="h-3 w-3 text-destructive" />}
          </div>
          <span className="text-xs text-muted-foreground">
            {row.original.currency_code}
            {row.original.symbol ? ` · ${row.original.symbol}` : ""}
          </span>
        </div>
      ),
      meta: { exportable: true, exportHeader: "Currency Code", exportValue: (row) => row.currency_code },
    },
    {
      accessorKey: "decimal_places",
      header: "Decimals",
      cell: ({ row }) => <span className="text-sm">{row.original.decimal_places}</span>,
      meta: { exportable: true, exportHeader: "Decimal Places", exportValue: (row) => String(row.decimal_places) },
    },
    {
      id: "base",
      header: "Base",
      cell: ({ row }) =>
        row.original.is_base_currency ? (
          <Badge variant="default" className="text-xs">Base</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
      meta: { exportable: true, exportHeader: "Base Currency", exportValue: (row) => (row.is_base_currency ? "Yes" : "No") },
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? "default" : "secondary"} className="text-xs">
          {row.original.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
      meta: { exportable: true, exportHeader: "Status", exportValue: (row) => (row.is_active ? "Active" : "Inactive") },
    },
    {
      accessorKey: "updated_at",
      header: "Updated",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {format(new Date(row.original.updated_at), "yyyy-MM-dd HH:mm")}
        </span>
      ),
      meta: { exportable: true, exportHeader: "Updated At", exportValue: (row) => row.updated_at },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <FinanceBasicsActionsCell
          item={row.original}
          authContext={authContext}
          permissions={permissions}
          deleteLabel="Retire"
          disabled={busy||unconfirmed||refreshError}
          onView={() => handleView(row.original)}
          onEdit={() => handleEdit(row.original)}
          onToggleActive={() => handleToggleActive(row.original)}
          onToggleLock={() => handleToggleLock(row.original)}
          onDelete={() => handleDeleteClick(row.original)}
        />
      ),
      meta: { exportable: false },
    },
  ];

  return (
    <>
      {actionError&&<div role="alert" className="mb-3 rounded border border-destructive p-3 text-sm"><p>{actionError}</p>{unconfirmed&&<Button type="button" disabled={busy} variant="outline" onClick={()=>{const p=pending.current;if(p)void changeCurrency(p.item,p.action);}}>Retry same currency change</Button>}</div>}
      {refreshError&&<div role="alert" className="mb-3 rounded border border-destructive p-3 text-sm"><p>The currency change was saved, but the display could not refresh. Refresh the list before making another change.</p><Button type="button" variant="outline" onClick={handleRefresh}>Refresh currency list</Button></div>}
      <ERPDataTable<Currency>
        tableId="currencies_table"
        columns={columns}
        data={currencies}
        enableSorting
        enableColumnResizing
        enableRowSelection
        enableColumnVisibility
        enablePreferences
        searchPlaceholder="Search by name, code, or symbol..."
        enableGlobalFilter
        initialPageSize={25}
        exportConfig={{
          title: "Currencies Master Data",
          subtitle: `${currencies.length} currenc${currencies.length !== 1 ? "ies" : "y"} configured`,
          filename: "currencies-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          permissions.manage ? <Button onClick={handleAdd} disabled={busy||unconfirmed||refreshError} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Currency
          </Button> : null
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={open=>{if(!busy&&!unconfirmed)setDeleteDialogOpen(open);}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire currency</AlertDialogTitle>
            <AlertDialogDescription>
              Deactivate{" "}
              <strong>{itemToDelete?.currency_name_en}</strong> ({itemToDelete?.currency_code})?
              Existing records and history will be retained. An authorized administrator can activate it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError&&<p role="alert" className="text-sm text-destructive">{actionError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy||unconfirmed}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={e=>{e.preventDefault();void handleDeleteConfirm();}}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Retiring..." : unconfirmed ? "Retry same retirement" : "Retire currency"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type ActionsCellProps<T extends { is_system: boolean; is_locked: boolean; is_active: boolean }> = {
  permissions?:{manage:boolean;lock:boolean;overrideLocked:boolean;retire:boolean};
  deleteLabel?:string;
  disabled?:boolean;
  item: T;
  authContext: AuthContext;
  onView: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
};

export function FinanceBasicsActionsCell<T extends { is_system: boolean; is_locked: boolean; is_active: boolean }>({
  item,
  authContext,
  onView,
  onEdit,
  onToggleActive,
  onToggleLock,
  onDelete,
  permissions,
  deleteLabel="Delete Permanently",
  disabled=false,
}: ActionsCellProps<T>) {
  const isSystemAdmin = permissions?.overrideLocked??isFinanceSystemAdmin(authContext);
  const hasManagePermission = permissions?.manage??hasGlobalPermission(authContext,'master_data.finance_basics.manage');
  const hasLockPermission = permissions?.lock??hasGlobalPermission(authContext,'master_data.lookups.lock');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Record actions" disabled={disabled} />}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onView}>
            <Eye className="h-4 w-4 mr-2" />
            View Details
          </DropdownMenuItem>
          {hasManagePermission && (
            <DropdownMenuItem onClick={onEdit} disabled={item.is_locked && !isSystemAdmin}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        {(hasManagePermission || hasLockPermission) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {hasManagePermission&&<DropdownMenuItem onClick={onToggleActive} disabled={item.is_locked && !isSystemAdmin}>
                <Power className="h-4 w-4 mr-2" />
                {item.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>}
              {(isSystemAdmin || hasLockPermission) && (
                <DropdownMenuItem onClick={onToggleLock}>
                  {item.is_locked ? (
                    <>
                      <Unlock className="h-4 w-4 mr-2" />
                      Unlock
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Lock
                    </>
                  )}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </>
        )}
        {(permissions?.retire??isSystemAdmin) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                {deleteLabel}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
