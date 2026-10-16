"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { LookupValue, LookupCategory } from "@/features/master-data/lookups/types";
import { RequiredLabel } from "@/components/erp/required-label";
import { FileText, Layers, Calendar, Shield, Info, Palette } from "lucide-react";
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
import {valueFormPayload} from '@/features/master-data/lookups/form-data';

type LookupValueWorkspaceFormProps = {
  value?: LookupValue | null;
  categories: LookupCategory[];
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "lookup-value-workspace-form";

export function LookupValueWorkspaceForm(props: LookupValueWorkspaceFormProps) {
  return <LookupValueFormSession key={props.value?.id ?? "new"} {...props} />;
}

function LookupValueFormSession({ value, categories, mode, authContext }: LookupValueWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab, updateTabRoute, renameTab, isTabActive } = useWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();
  const capabilities=lookupCapabilities(authContext);
  const session=useLookupMutation(FORM_ID,value?.id??null,value?.workspace_revision);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string|null>(null);
  const localBlocked = useRef(false);
  const sections = [
    { id: "basic", label: "Basic Info", icon: FileText },
    { id: "display", label: "Display & Hierarchy", icon: Layers },
    { id: "dates", label: "Effective Dates", icon: Calendar },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];
  const [activeSection, setActiveSection] = useWorkspaceFormSection(FORM_ID, "basic", sections.map(section => section.id));
  const [colorPreview, setColorPreview] = useState(value?.color_hex ?? "");

  const isEditing = mode === "edit" || session.savedId !== null;
  const isViewing = mode === "view" || !capabilities.manage || ((!!value?.is_locked || !!categories.find(c=>c.id===value?.category_id)?.is_locked) && !capabilities.lock);

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftNullableId, getDraftBoolean, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });
  const [recordCode, setRecordCode] = useState(() => value?.value_code ?? getDraftDefault("value_code", ""));

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(() => {
    return getDraftNullableId("category_id", value?.category_id ?? (categories[0]?.id ?? null));
  });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const selectedCategory = categories.find((cat) => cat.id === selectedCategoryId);


  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (closeAfter = false): Promise<boolean> => {
    if (!session.isCurrent() || isViewing || isSubmitting || session.blocked || localBlocked.current) return false;
    setIsSubmitting(true);
    let acknowledged = false;
    try {
      const form=document.getElementById(FORM_ID) as HTMLFormElement;
      const creating=session.savedId===null;
      const selected=categories.find(c=>c.id===(value?.category_id??selectedCategoryId));
      if(!session.uncertain&&!selected){toast.error('The category could not be verified. Reopen this record before saving.');return false;}
      const result=await session.run(session.uncertain?undefined:{
        kind:'value',action:'save',categoryId:selected!.id,categoryRevision:String(selected!.workspace_revision),
        data:valueFormPayload(new FormData(form),creating),
      });
      if(!session.isCurrent())return false;
      if(result.success) {
        if(!result.acknowledged){toast.warning('Saved, but this workspace could not acknowledge it. Reopen the record.');return false;}
        acknowledged=true;
        const original=result.retainedCommand,receipt=result.data;
        if(!original||!receipt)throw Error('Acknowledged identity is unavailable.');
        const code=typeof original.data.value_code==='string'?original.data.value_code:recordCode;
        const name=String(original.data.value_label_en??value?.value_label_en??code);
        const unchanged=lookupDraftMatches(form,original);
        setRecordCode(code);setSelectedCategoryId(receipt.category_id);
        const route=`/admin/master-data/lookups/values/record/${receipt.id}?mode=edit`;
        let failed=false;
        const effect=(action:()=>void)=>{if(session.isCurrent())try{action();}catch{failed=true;}};
        if(unchanged)effect(()=>{clearDraft();resetDirty();});
        else effect(()=>{syncDraft();writeDraftField('value_code',code);writeDraftField('category_id',receipt.category_id);});
        if(activeTab){
          effect(()=>markDirty(activeTab.id,!unchanged));
          effect(()=>updateTabRoute(activeTab.id,route,receipt.id,'edit'));
          effect(()=>renameTab(activeTab.id,name,code));
        }
        effect(()=>invalidateAllLookups(queryClient));
        if(!closeAfter&&creating&&activeTab)effect(()=>{if(isTabActive(activeTab.id))router.replace(route);});
        if(failed)throw Error('Local display could not refresh.');
        effect(()=>toast.success('Lookup value saved.'));
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
      title={isViewing ? "View Lookup Value" : isEditing ? "Edit Lookup Value" : "New Lookup Value"}
      subtitle={isEditing || value ? `Value Code: ${recordCode}` : "Create a new lookup value"}
      recordCode={isEditing || value ? recordCode : undefined}
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
              <RequiredLabel htmlFor="category_id">Category</RequiredLabel>
              <Select
                id="category_id"
                name="category_id"
                items={categories.map(cat=>({value:String(cat.id),label:`${cat.category_name_en} (${cat.category_code})`}))}
                value={selectedCategoryId?.toString()}
                onValueChange={(val) => { const n = val ? parseInt(val) : null; setSelectedCategoryId(n); writeDraftField("category_id", n ?? ""); }}
                disabled={isViewing || isEditing || session.savedId!==null}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category">{selectedCategoryId!==null&&!selectedCategory?'Selected category unavailable — reopen this record':undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.category_name_en} ({cat.category_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[9px] text-muted-foreground">Cannot be changed after creation</span>
            </div>

            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="value_code">Value Code</RequiredLabel>
              <Input
                id="value_code"
                name="value_code"
                required
                value={recordCode}
                onChange={(event)=>setRecordCode(event.target.value)}
                disabled={isViewing || isEditing || session.savedId!==null}
                placeholder="PENDING"
                className="uppercase"
                maxLength={100}
              />
              <span className="text-[9px] text-muted-foreground">Unique within category (uppercase, alphanumeric with underscores)</span>
            </div>

            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="value_label_en">Label (English)</RequiredLabel>
              <Input
                id="value_label_en"
                name="value_label_en"
                required
                defaultValue={getDraftDefault("value_label_en", value?.value_label_en ?? "")}
                disabled={isViewing}
                placeholder="Pending"
                maxLength={200}
              />
            </div>

            <div className="space-y-2 col-span-6">
              <Label htmlFor="value_label_ar" className="text-muted-foreground text-xs">Label (Arabic)</Label>
              <Input
                id="value_label_ar"
                name="value_label_ar"
                defaultValue={getDraftDefault("value_label_ar", value?.value_label_ar ?? "")}
                disabled={isViewing}
                placeholder="قيد الانتظار"
                maxLength={200}
                dir="rtl"
              />
            </div>

            <div className="space-y-2 col-span-12">
              <Label htmlFor="description" className="text-muted-foreground text-xs">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={getDraftDefault("description", value?.description ?? "")}
                disabled={isViewing}
                placeholder="Optional description of this lookup value"
                maxLength={1000}
                rows={2}
              />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="display" activeId={activeSection} title="Display & Hierarchy">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input
                id="sort_order"
                name="sort_order"
                type="number"
                min={0}
                defaultValue={getDraftDefault("sort_order", value?.sort_order ?? 0)}
                disabled={isViewing}
                placeholder="0"
              />
              <span className="text-[9px] text-muted-foreground">Controls display order (0 = first)</span>
            </div>

            {selectedCategory?.supports_color && (
              <>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="color_hex" className="text-muted-foreground text-xs">Color (Hex)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="color_hex"
                      name="color_hex"
                      defaultValue={getDraftDefault("color_hex", value?.color_hex ?? "")}
                      disabled={isViewing}
                      placeholder="#22C55E"
                      maxLength={7}
                      className="font-mono"
                      onChange={(e) => setColorPreview(e.target.value)}
                    />
                    {colorPreview && (
                      <div className="w-10 h-10 rounded-md border-2 border-border flex-shrink-0" style={{ backgroundColor: colorPreview }} />
                    )}
                  </div>
                  <span className="text-[9px] text-muted-foreground">Format: #RRGGBB (e.g., #22C55E for green)</span>
                </div>

                <div className="space-y-2 col-span-6">
                  <Label htmlFor="badge_variant" className="text-muted-foreground text-xs">Badge Variant</Label>
                  <Select name="badge_variant" defaultValue={getDraftDefault("badge_variant", value?.badge_variant ?? "__none")} disabled={isViewing}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No badge variant</SelectItem>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="destructive">Destructive</SelectItem>
                      <SelectItem value="outline">Outline</SelectItem>
                      <SelectItem value="secondary">Secondary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {selectedCategory?.supports_icon && (
              <div className="space-y-2 col-span-6">
                <Label htmlFor="icon_name" className="text-muted-foreground text-xs">Icon Name</Label>
                <Input
                  id="icon_name"
                  name="icon_name"
                  defaultValue={getDraftDefault("icon_name", value?.icon_name ?? "")}
                  disabled={isViewing}
                  placeholder="CheckCircle"
                  maxLength={50}
                />
                <span className="text-[9px] text-muted-foreground">Lucide icon name (e.g., CheckCircle, AlertTriangle)</span>
              </div>
            )}

            {colorPreview && selectedCategory?.supports_color && (
              <div className="col-span-12">
                <Card className="bg-indigo-500/5 border-indigo-500/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Palette className="h-5 w-5 text-indigo-500" />
                    <div>
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Badge Preview</div>
                      <Badge
                        variant="outline"
                        style={{
                          backgroundColor: `${colorPreview}15`,
                          borderColor: `${colorPreview}40`,
                          color: colorPreview,
                        }}
                      >
                        {value?.value_label_en || "Preview"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="dates" activeId={activeSection} title="Effective Dates & Metadata">
          <div className="grid grid-cols-12 gap-4">
            {selectedCategory?.supports_effective_dates && (
              <>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="effective_from" className="text-muted-foreground text-xs">Effective From</Label>
                  <Input
                    id="effective_from"
                    name="effective_from"
                    type="date"
                    defaultValue={getDraftDefault("effective_from", value?.effective_from?.split("T")[0] ?? "")}
                    disabled={isViewing}
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="effective_to" className="text-muted-foreground text-xs">Effective To</Label>
                  <Input
                    id="effective_to"
                    name="effective_to"
                    type="date"
                    defaultValue={getDraftDefault("effective_to", value?.effective_to?.split("T")[0] ?? "")}
                    disabled={isViewing}
                  />
                </div>
              </>
            )}
            {selectedCategory?.supports_metadata && (
              <div className="space-y-2 col-span-12">
                <Label htmlFor="metadata_json" className="text-muted-foreground text-xs">Metadata (JSON)</Label>
                <Textarea
                  id="metadata_json"
                  name="metadata_json"
                  defaultValue={
                    getDraftDefault("metadata_json", value?.metadata_json ? JSON.stringify(value.metadata_json, null, 2) : "")
                  }
                  disabled={isViewing}
                  placeholder='{"key": "value"}'
                  rows={4}
                  className="font-mono text-xs"
                />
                <span className="text-[9px] text-muted-foreground">Optional JSON object for custom attributes</span>
              </div>
            )}
            {!selectedCategory?.supports_effective_dates && !selectedCategory?.supports_metadata && (
              <div className="col-span-12">
                <p className="text-sm text-muted-foreground italic">
                  No effective dates or metadata supported by the selected category.
                </p>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status and Governance">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", value?.is_active ?? true)} disabled={isViewing} />
                <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="is_default" checked={value?.is_default??false} disabled />
                <Label htmlFor="is_default" className="text-sm font-normal cursor-pointer">Default — save this record, then use the list Set as Default command</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="is_locked" checked={value?.is_locked??false} disabled />
                <Label htmlFor="is_locked" className="text-sm font-normal cursor-pointer">Locked — change using the list Lock/Unlock command</Label>
              </div>
            </div>
            {value?.is_system && (
              <div className="col-span-12">
                <Card className="bg-amber-500/5 border-amber-500/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Shield className="h-5 w-5 text-amber-500" />
                    <div className="text-xs text-amber-600 dark:text-amber-400">
                      <strong>System Value:</strong> This value is managed by the system and cannot be deleted.
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {value ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input aria-label="Created At" value={new Date(value.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input aria-label="Updated At" value={new Date(value.updated_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created By</Label>
                <Input aria-label="Created By" value={value.created_by ?? "—"} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated By</Label>
                <Input aria-label="Updated By" value={value.updated_by ?? "—"} disabled className="text-xs" />
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
