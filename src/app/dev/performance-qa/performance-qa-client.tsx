"use client";

/**
 * DEV-ONLY: 3B.6F Performance QA Harness — Client Component
 *
 * Tests (without authenticated ERP routes):
 *   1. Cache dedup   — open two forms using the same wrapper; confirm second call is served from cache
 *   2. Combobox UX   — open/search/select/clear; loading + empty states
 *   3. Dirty / Safe Close — combobox-only change must trigger dirty
 *   4. lazyMount     — section stays null until activated
 *   5. Save behavior — Save keeps open; Save & Close closes
 *
 * Instrumented via: console.log("[QA]"), query cache inspection.
 */

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountrySelect } from "@/components/erp/geography";
import { CurrencySelect, PaymentTermSelect, TaxTypeSelect, BankSelect } from "@/components/erp/finance-basics";
import { OwnerCompanySelect, BranchSelect } from "@/components/erp/organizations";
import { CostCenterSelect, ProfitCenterSelect } from "@/components/erp/finance-basics";
import { UomCategorySelect, UnitOfMeasureSelect } from "@/components/erp/uom";
import { LookupSelect } from "@/components/erp/lookup-select";
import { ERPDrawerForm, ERPDrawerSectionNav, ERPDrawerBody, ERPDrawerSection, ERPFieldGrid } from "@/components/erp/erp-drawer-form";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { Building2, Info } from "lucide-react";
import { toast } from "sonner";

// ─── Cache Inspector ────────────────────────────────────────────────────────

function CacheInspector() {
  const queryClient = useQueryClient();
  const [entries, setEntries] = React.useState<{ key: string; status: string; dataUpdatedAt: number }[]>([]);

  const refresh = React.useCallback(() => {
    const all = queryClient.getQueryCache().findAll({ type: "active" });
    setEntries(
      all.map((q) => ({
        key: JSON.stringify(q.queryKey),
        status: q.state.status,
        dataUpdatedAt: q.state.dataUpdatedAt,
      }))
    );
  }, [queryClient]);

  React.useEffect(() => {
    refresh();
    // Subscribe to cache changes
    const unsub = queryClient.getQueryCache().subscribe(refresh);
    return unsub;
  }, [queryClient, refresh]);

  return (
    <div className="border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          TanStack Query Cache ({entries.length} active queries)
        </h3>
        <Button size="sm" variant="outline" onClick={refresh} className="h-6 text-[10px]">
          Refresh
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active queries yet. Open a combobox to trigger fetches.</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
              <Badge
                variant="outline"
                className={`text-[9px] px-1 py-0 ${e.status === "success" ? "text-emerald-600 border-emerald-500/30" : "text-amber-600 border-amber-500/30"}`}
              >
                {e.status}
              </Badge>
              <span className="text-muted-foreground truncate max-w-[400px]">{e.key}</span>
              {e.dataUpdatedAt > 0 && (
                <span className="text-muted-foreground/50 shrink-0">
                  updated {new Date(e.dataUpdatedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[9px] text-muted-foreground mt-2">
        Cache dedup proof: if two comboboxes share a query key, only one entry appears after both are opened.
      </p>
    </div>
  );
}

// ─── Suite 1: Cache Dedup Demo ───────────────────────────────────────────────

function CacheDedupSuite() {
  const [countryA, setCountryA] = React.useState<number | null>(null);
  const [countryB, setCountryB] = React.useState<number | null>(null);
  const [currencyA, setCurrencyA] = React.useState<number | null>(null);
  const [currencyB, setCurrencyB] = React.useState<number | null>(null);
  const [catA, setCatA] = React.useState<string | null>(null);
  const [catB, setCatB] = React.useState<string | null>(null);

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold border-b pb-2">
        Suite 1 — Cache Dedup: open both columns; second should hit cache (no duplicate network request)
      </h2>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">Instance A</p>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">CountrySelect A</label>
            <CountrySelect value={countryA} onValueChange={setCountryA} placeholder="Open to fetch countries" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">CurrencySelect A</label>
            <CurrencySelect value={currencyA} onValueChange={setCurrencyA} placeholder="Open to fetch currencies" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">LookupSelect CUSTOMER_TYPES A</label>
            <LookupSelect
              categoryCode="CUSTOMER_TYPES"
              value={catA}
              onValueChange={(v) => setCatA(v as string | null)}
              placeholder="Open to fetch lookup"
              valueField="code"
            />
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">Instance B (same data, should dedup)</p>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">CountrySelect B</label>
            <CountrySelect value={countryB} onValueChange={setCountryB} placeholder="Same query key → cache hit" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">CurrencySelect B</label>
            <CurrencySelect value={currencyB} onValueChange={setCurrencyB} placeholder="Same query key → cache hit" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">LookupSelect CUSTOMER_TYPES B</label>
            <LookupSelect
              categoryCode="CUSTOMER_TYPES"
              value={catB}
              onValueChange={(v) => setCatB(v as string | null)}
              placeholder="Same query key → cache hit"
              valueField="code"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Suite 2: All Wrappers ───────────────────────────────────────────────────

function AllWrappersSuite() {
  const [ownerCompany, setOwnerCompany] = React.useState<number | null>(null);
  const [branch, setBranch] = React.useState<number | null>(null);
  const [costCenter, setCostCenter] = React.useState<number | null>(null);
  const [profitCenter, setProfitCenter] = React.useState<number | null>(null);
  const [bank, setBank] = React.useState<number | null>(null);
  const [payTerm, setPayTerm] = React.useState<number | null>(null);
  const [taxType, setTaxType] = React.useState<number | null>(null);
  const [uomCat, setUomCat] = React.useState<number | null>(null);
  const [unit, setUnit] = React.useState<number | null>(null);

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold border-b pb-2">
        Suite 2 — All Converted Wrappers: open each, verify data loads, select works
      </h2>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "OwnerCompanySelect", el: <OwnerCompanySelect value={ownerCompany} onValueChange={setOwnerCompany} /> },
          { label: "BranchSelect", el: <BranchSelect value={branch} onValueChange={setBranch} ownerCompanyId={ownerCompany} /> },
          { label: "BankSelect", el: <BankSelect value={bank} onValueChange={setBank} /> },
          { label: "PaymentTermSelect", el: <PaymentTermSelect value={payTerm} onValueChange={setPayTerm} /> },
          { label: "TaxTypeSelect", el: <TaxTypeSelect value={taxType} onValueChange={setTaxType} /> },
          { label: "UomCategorySelect", el: <UomCategorySelect value={uomCat} onValueChange={setUomCat} /> },
          { label: "UnitOfMeasureSelect", el: <UnitOfMeasureSelect value={unit} onValueChange={setUnit} categoryId={uomCat} /> },
          { label: "CostCenterSelect", el: <CostCenterSelect value={costCenter} onValueChange={setCostCenter} /> },
          { label: "ProfitCenterSelect", el: <ProfitCenterSelect value={profitCenter} onValueChange={setProfitCenter} /> },
        ].map(({ label, el }) => (
          <div key={label} className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">{label}</label>
            {el}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Suite 3: Dirty / Safe Close ────────────────────────────────────────────

function DirtyDrawerSuite() {
  const [open, setOpen] = React.useState(false);
  const [countryId, setCountryId] = React.useState<number | null>(null);
  const [currencyId, setCurrencyId] = React.useState<number | null>(null);
  const [catCode, setCatCode] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState("basic");

  const { isDirty, resetDirty } = useFormDirty({ formId: "qa-form", enabled: true });

  const sections = [
    { id: "basic", label: "Combobox Fields", icon: Building2 },
    { id: "lazy", label: "Lazy Section", icon: Info },
  ];

  const handleSave = async () => {
    setIsSubmitting(true);
    await new Promise(r => setTimeout(r, 500));
    toast.success("QA: Save successful (simulated)");
    resetDirty();
    setIsSubmitting(false);
    return true;
  };

  const handleSaveAndClose = async () => {
    const ok = await handleSave();
    if (ok) setOpen(false);
  };

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold border-b pb-2">
        Suite 3 — Dirty Tracking & Safe Close
      </h2>
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>1. Open the drawer below.</p>
        <p>2. Change ONLY a combobox (do not type in any text field).</p>
        <p>3. Click X or outside — expect <strong>Unsaved Changes</strong> dialog.</p>
        <p>4. Click Stay, verify selected value persists.</p>
        <p>5. Click Save, verify dirty resets and drawer stays open.</p>
        <p>6. Click Save &amp; Close, verify drawer closes.</p>
      </div>
      <Button onClick={() => { setOpen(true); setCountryId(null); setCurrencyId(null); setCatCode(null); resetDirty(); }}>
        Open QA Drawer
      </Button>
      <div className="text-xs">
        Dirty state: <Badge variant={isDirty ? "destructive" : "outline"}>{isDirty ? "DIRTY" : "clean"}</Badge>
      </div>

      <ERPDrawerForm
        open={open}
        onOpenChange={setOpen}
        title="3B.6F Dirty / Safe Close QA"
        subtitle="Combobox-only dirty tracking test"
        mode="add"
        isDirty={isDirty}
      >
        <ERPDrawerSectionNav sections={sections} activeSection={activeSection} setActiveSection={setActiveSection} />
        <form id="qa-form" className="flex-1 flex flex-col overflow-hidden">
          <ERPDrawerBody>
            <ERPDrawerSection id="basic" activeId={activeSection} title="Combobox Fields (always mounted)">
              <ERPFieldGrid>
                <div className="col-span-6 space-y-1">
                  <label className="text-xs text-muted-foreground">CountrySelect</label>
                  <CountrySelect value={countryId} onValueChange={setCountryId} />
                </div>
                <div className="col-span-6 space-y-1">
                  <label className="text-xs text-muted-foreground">CurrencySelect</label>
                  <CurrencySelect value={currencyId} onValueChange={setCurrencyId} />
                </div>
                <div className="col-span-12 space-y-1">
                  <label className="text-xs text-muted-foreground">LookupSelect (CUSTOMER_TYPES)</label>
                  <LookupSelect
                    categoryCode="CUSTOMER_TYPES"
                    value={catCode}
                    onValueChange={(v) => setCatCode(v as string | null)}
                    placeholder="Select customer type"
                    valueField="code"
                  />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* lazyMount section — should not render until activated */}
            <ERPDrawerSection id="lazy" activeId={activeSection} title="Lazy Section (mounts on first visit)" lazyMount>
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-4 text-xs text-emerald-800 dark:text-emerald-300">
                ✓ This section was lazy-mounted. It rendered only when you clicked &quot;Lazy Section&quot; in the nav.
                <br />
                Switch back to &quot;Combobox Fields&quot; and return — this section stays mounted (values preserved).
              </div>
              <ERPFieldGrid>
                <div className="col-span-6 space-y-1">
                  <label className="text-xs text-muted-foreground">BankSelect (lazy)</label>
                  <BankSelect value={null} onValueChange={() => {}} />
                </div>
                <div className="col-span-6 space-y-1">
                  <label className="text-xs text-muted-foreground">TaxTypeSelect (lazy)</label>
                  <TaxTypeSelect value={null} onValueChange={() => {}} />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>
          </ERPDrawerBody>

          <ERPFormFooter
            mode="add"
            onSave={handleSave}
            onSaveAndClose={handleSaveAndClose}
            onCancel={() => setOpen(false)}
            isSubmitting={isSubmitting}
            hasUnsavedChanges={isDirty}
          />
        </form>
      </ERPDrawerForm>
    </section>
  );
}

// ─── Suite 4: View Mode ──────────────────────────────────────────────────────

function ViewModeSuite() {
  const [open, setOpen] = React.useState(false);

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold border-b pb-2">Suite 4 — View Mode (no dirty, no Safe Close dialog)</h2>
      <p className="text-xs text-muted-foreground">Open, click X or outside — should close immediately with no dialog.</p>
      <Button variant="outline" onClick={() => setOpen(true)}>Open View Drawer</Button>
      <ERPDrawerForm
        open={open}
        onOpenChange={setOpen}
        title="View Mode QA"
        subtitle="Should close without dirty dialog"
        mode="view"
        isDirty={false}
      >
        <div className="flex-1 p-6 text-sm text-muted-foreground">
          This is view mode. Click ✕ or press Escape. No Unsaved Changes dialog should appear.
        </div>
      </ERPDrawerForm>
    </section>
  );
}

// ─── Page Root ───────────────────────────────────────────────────────────────

export function PerformanceQAClient() {
  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-10">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">3B.6F — Performance QA Harness</h1>
        <p className="text-xs text-muted-foreground">
          DEV ONLY · Route: /dev/performance-qa · Remove or guard before production
        </p>
        <div className="flex gap-2 flex-wrap mt-2">
          {["TanStack Query v5", "ERPCombobox", "lazyMount", "Dirty Tracking", "Safe Close"].map(t => (
            <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
          ))}
        </div>
      </div>

      <CacheInspector />
      <CacheDedupSuite />
      <AllWrappersSuite />
      <DirtyDrawerSuite />
      <ViewModeSuite />

      <div className="border-t pt-6 text-xs text-muted-foreground space-y-1">
        <p><strong>How to use this harness:</strong></p>
        <p>1. Open comboboxes in Suite 1 — A first, then B. Check Cache Inspector: only 1 entry per data type = cache dedup working.</p>
        <p>2. Open all wrappers in Suite 2. Verify each loads and allows selection.</p>
        <p>3. In Suite 3: open drawer → change combobox only → click X → Unsaved Changes dialog must appear.</p>
        <p>4. In Suite 4: open View drawer → click X → closes directly, no dialog.</p>
        <p>5. Open browser Network tab: each data type should appear once regardless of how many comboboxes are open.</p>
      </div>
    </div>
  );
}
