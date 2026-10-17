"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { LookupCategory } from "@/features/master-data/lookups/types";
import { RequiredLabel } from "@/components/erp/required-label";
import { Folder, Settings, Shield, Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceFormDirty as useFormDirty } from "@/hooks/use-workspace-form-dirty";
import { invalidateAllLookups } from "@/lib/query/invalidation";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspaceFormNavigation as useWorkspace } from "@/hooks/use-workspace-form-navigation";
import { useWorkspaceFormSection } from "@/hooks/use-workspace-form-section";
import {
  ERPRecordWorkspaceForm,
  ERPRecordSectionPanel,
} from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import {useLookupMutation,lookupDraftMatches} from '@/features/master-data/lookups/use-lookup-mutation';
import {lookupCapabilities} from '@/features/master-data/lookups/permissions';
import {categoryFormPayload} from '@/features/master-data/lookups/form-data';

type LookupCategoryWorkspaceFormProps = {
  category?: LookupCategory | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "lookup-category-workspace-form";

export function LookupCategoryWorkspaceForm(props:LookupCategoryWorkspaceFormProps) {
 return <LookupCategoryFormSession key={props.category?.id ?? 'new'} {...props}/>;
}
function LookupCategoryFormSession({ category, mode, authContext }: LookupCategoryWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab, updateTabRoute, renameTab, isTabActive } = useWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();
  const capabilities=lookupCapabilities(authContext);
  const session=useLookupMutation(FORM_ID,category?.id??null,category?.workspace_revision);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string|null>(null);
  const localBlocked = useRef(false);
  const sections = [
    { id: "basic", label: "Basic Info", icon: Folder },
    { id: "scope", label: "Scope & Behavior", icon: Settings },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];
  const [activeSection, setActiveSection] = useWorkspaceFormSection(FORM_ID, "basic", sections.map(section => section.id));

  const isEditing = mode === "edit" || session.savedId !== null;
  const isViewing = mode === "view" || !capabilities.manage || (!!category?.is_locked && !capabilities.lock);

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });
  const [recordCode, setRecordCode] = useState(() => category?.category_code ?? getDraftDefault("category_code", ""));

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);


  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (closeAfter = false): Promise<boolean> => {
    if (!session.isCurrent() || isViewing || isSubmitting || session.blocked || localBlocked.current) return false;
    setIsSubmitting(true);
    let acknowledged = false;
    try {
      const form=document.getElementById(FORM_ID) as HTMLFormElement;
      const creating=session.savedId===null;
      const result=await session.run(session.uncertain?undefined:{
        kind:'category',action:'save',categoryId:null,categoryRevision:null,
        data:categoryFormPayload(new FormData(form),creating),
      });
      if(!session.isCurrent())return false;
      if(result.success) {
        if(!result.acknowledged){toast.warning('Saved, but this workspace could not acknowledge it. Reopen the record.');return false;}
        acknowledged=true;
        const original=result.retainedCommand,receipt=result.data;
        if(!original||!receipt)throw Error('Acknowledged identity is unavailable.');
        const code=typeof original.data.category_code==='string'?original.data.category_code:recordCode;
        const name=String(original.data.category_name_en??category?.category_name_en??code);
        const unchanged=lookupDraftMatches(form,original);
        setRecordCode(code);
        const route=`/admin/master-data/lookups/categories/record/${receipt.id}?mode=edit`;
        let failed=false;
        const effect=(action:()=>void)=>{if(session.isCurrent())try{action();}catch{failed=true;}};
        if(unchanged)effect(()=>{clearDraft();resetDirty();});
        else effect(()=>{syncDraft();writeDraftField('category_code',code);});
        if(activeTab){
          effect(()=>markDirty(activeTab.id,!unchanged));
          effect(()=>updateTabRoute(activeTab.id,route,receipt.id,'edit'));
          effect(()=>renameTab(activeTab.id,name,code));
        }
        effect(()=>invalidateAllLookups(queryClient));
        if(!closeAfter&&creating&&activeTab)effect(()=>{if(isTabActive(activeTab.id))router.replace(route);});
        if(failed)throw Error('Local display could not refresh.');
        effect(()=>toast.success('Lookup category saved.'));
        if(closeAfter&&unchanged)effect(()=>forceCloseActiveTab());
        if(failed)throw Error('Local completion could not finish.');
        return true;
      }
      toast.error(result.error??'The lookup could not be saved.');return false;
    }catch{
      if(!session.isCurrent())return acknowledged;
      if(acknowledged){
        localBlocked.current=true;
        const error='Saved. A local view could not refresh; reopen it before another change.';
        setLocalError(error);try{toast.warning(error);}catch{/* Feedback cannot retry a confirmed save. */}
        return true;
      }
      toast.error('Check the rendered fields and metadata. Your entries are retained.');return false;
    }
    finally{if(session.isCurrent())setIsSubmitting(false);}
  };

  const handleSaveAndClose = async () => {
    await handleSave(true);
  };

  return (
    <ERPRecordWorkspaceForm
      mode={isViewing ? "view" : isEditing ? "edit" : "add"}
      title={isViewing ? "View Lookup Category" : isEditing ? "Edit Lookup Category" : "New Lookup Category"}
      subtitle={isEditing || category ? `Category Code: ${recordCode}` : "Create a new lookup category"}
      recordCode={isEditing || category ? recordCode : undefined}
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={isDirty}
      onSave={isViewing || session.blocked || localError ? undefined : handleSave}
      onSaveAndClose={isViewing || session.blocked || localError ? undefined : handleSaveAndClose}
      onRequestClose={handleRequestClose}
      isSubmitting={isSubmitting}
    >
      {(localError||session.message||session.recoveryError) && <div role="alert" className="m-4 rounded border p-3"><p>{localError??session.message??session.recoveryError}</p>{session.uncertain&&!session.blocked&&!localError&&<button type="button" onClick={()=>void handleSave()} disabled={session.working}>Recover original request</button>}</div>}
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); handleSaveAndClose(); }} onInput={syncDraft} onChange={syncDraft}>
        <fieldset disabled={isViewing||session.working||session.uncertain||session.blocked||!!localError} className="contents">
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Basic Information">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="category_code">Category Code</RequiredLabel>
              <Input
                id="category_code"
                name="category_code"
                required
                value={recordCode}
                onChange={(event)=>setRecordCode(event.target.value)}
                disabled={isViewing || isEditing || session.savedId!==null}
                placeholder="STATUS_TYPES"
                className="uppercase"
                maxLength={100}
              />
              <span className="text-[9px] text-muted-foreground">Unique identifier (uppercase, alphanumeric with underscores)</span>
            </div>

            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="category_name_en">English Name</RequiredLabel>
              <Input
                id="category_name_en"
                name="category_name_en"
                required
                defaultValue={getDraftDefault("category_name_en", category?.category_name_en ?? "")}
                disabled={isViewing}
                placeholder="Status Types"
                maxLength={200}
              />
            </div>

            <div className="space-y-2 col-span-6">
              <Label htmlFor="category_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
              <Input
                id="category_name_ar"
                name="category_name_ar"
                defaultValue={getDraftDefault("category_name_ar", category?.category_name_ar ?? "")}
                disabled={isViewing}
                placeholder="أنواع الحالات"
                maxLength={200}
                dir="rtl"
              />
            </div>

            <div className="space-y-2 col-span-6">
              <Label htmlFor="module_code" className="text-muted-foreground text-xs">Module Code</Label>
              <Input
                id="module_code"
                name="module_code"
                defaultValue={getDraftDefault("module_code", category?.module_code ?? "")}
                disabled={isViewing}
                placeholder="HR"
                maxLength={50}
              />
              <span className="text-[9px] text-muted-foreground">e.g., HR, FLEET, HSE, or leave blank for cross-module</span>
            </div>

            <div className="space-y-2 col-span-12">
              <Label htmlFor="description" className="text-muted-foreground text-xs">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={getDraftDefault("description", category?.description ?? "")}
                disabled={isViewing}
                placeholder="Lookup values for system status states (active, inactive, etc.)"
                maxLength={1000}
                rows={2}
              />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="scope" activeId={activeSection} title="Scope and Behavior">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <Label htmlFor="category_scope" className="text-muted-foreground text-xs">Category Scope *</Label>
              <Select name="category_scope" defaultValue={getDraftDefault("category_scope", category?.category_scope ?? "GLOBAL")} disabled={isViewing}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GLOBAL">Global (System-wide)</SelectItem>
                  <SelectItem value="COMPANY">Company-specific</SelectItem>
                  <SelectItem value="BRANCH">Branch-specific</SelectItem>
                  <SelectItem value="MODULE">Module-specific</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input
                id="sort_order"
                name="sort_order"
                type="number"
                min={0}
                defaultValue={getDraftDefault("sort_order", category?.sort_order ?? 0)}
                disabled={isViewing}
              />
            </div>

            <div className="space-y-3 col-span-12">
              <Label className="text-muted-foreground text-xs">Feature Flags</Label>
              <div className="flex items-center space-x-2">
                <Checkbox id="supports_hierarchy" name="supports_hierarchy" defaultChecked={getDraftBoolean("supports_hierarchy", category?.supports_hierarchy ?? false)} disabled={isViewing} />
                <Label htmlFor="supports_hierarchy" className="text-sm font-normal cursor-pointer">Supports Hierarchy (parent/child values)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="supports_color" name="supports_color" defaultChecked={getDraftBoolean("supports_color", category?.supports_color ?? false)} disabled={isViewing} />
                <Label htmlFor="supports_color" className="text-sm font-normal cursor-pointer">Supports Color (hex colors for badges)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="supports_icon" name="supports_icon" defaultChecked={getDraftBoolean("supports_icon", category?.supports_icon ?? false)} disabled={isViewing} />
                <Label htmlFor="supports_icon" className="text-sm font-normal cursor-pointer">Supports Icon (icon names for UI)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="supports_effective_dates" name="supports_effective_dates" defaultChecked={getDraftBoolean("supports_effective_dates", category?.supports_effective_dates ?? false)} disabled={isViewing} />
                <Label htmlFor="supports_effective_dates" className="text-sm font-normal cursor-pointer">Supports Effective Dates (time-bound values)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="supports_metadata" name="supports_metadata" defaultChecked={getDraftBoolean("supports_metadata", category?.supports_metadata ?? true)} disabled={isViewing} />
                <Label htmlFor="supports_metadata" className="text-sm font-normal cursor-pointer">Supports Metadata (custom JSON data)</Label>
              </div>
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status and Governance">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <div className="flex items-center space-x-2">
                <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", category?.is_active ?? true)} disabled={isViewing} />
                <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
              </div>
            </div>
            <div className="space-y-2 col-span-6">
              <div className="flex items-center space-x-2">
                <Checkbox id="is_locked" checked={category?.is_locked??false} disabled />
                <Label htmlFor="is_locked" className="text-sm font-normal cursor-pointer">Locked — change using the list Lock/Unlock command</Label>
              </div>
            </div>
            {category?.is_system && (
              <div className="col-span-12">
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div className="text-xs text-amber-800 dark:text-amber-300">
                      <strong>System Category:</strong> This is a protected system category seeded during installation. Exercise caution when modifying.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {category ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input aria-label="Created At" value={new Date(category.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input aria-label="Updated At" value={new Date(category.updated_at).toLocaleString()} disabled className="text-xs" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Audit information will be available after saving</p>
          )}
        </ERPRecordSectionPanel>
        </fieldset>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
