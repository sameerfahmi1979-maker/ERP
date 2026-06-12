"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { OwnerCompany } from "@/types/database";
import { createOrganization, updateOrganization } from "@/server/actions/organizations";
import { 
  ERPDrawerForm, 
  ERPDrawerSectionNav, 
  ERPDrawerBody, 
  ERPDrawerSection, 
  ERPFieldGrid
} from "@/components/erp/erp-drawer-form";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import { RequiredLabel } from "@/components/erp/required-label";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { Label } from "@/components/ui/label";
import { CountrySelect } from "@/components/erp/geography/country-select";
import { EmirateSelect } from "@/components/erp/geography/emirate-select";
import { CitySelect } from "@/components/erp/geography/city-select";
import { AreaZoneSelect } from "@/components/erp/geography/area-zone-select";
import { CurrencySelect } from "@/components/erp/finance-basics/currency-select";
import { createClient } from "@/lib/supabase/client";
import { 
  Building2, 
  MapPin, 
  ShieldCheck, 
  FileCode2, 
  ScrollText 
} from "lucide-react";

type OrganizationFormDialogProps = {
  organization?: OwnerCompany | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function OrganizationFormDialog({
  organization,
  open,
  onOpenChange,
}: OrganizationFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = Boolean(organization);

  const formId = "organization-drawer-form";

  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: formId,
    enabled: true,
  });
  
  // Geography cascading state (Phase 002F.3C.1B.1)
  const [countryId, setCountryId] = useState<number | null>(organization?.country_id ?? null);
  const [emirateId, setEmirateId] = useState<number | null>(organization?.emirate_id ?? null);
  const [cityId, setCityId] = useState<number | null>(organization?.city_id ?? null);
  const [areaZoneId, setAreaZoneId] = useState<number | null>(organization?.area_zone_id ?? null);
  
  // Geography names state (Phase 002F.3C.4B) - to sync legacy text fields
  const [emirateName, setEmirateName] = useState<string | null>(null);
  
  // Currency state (Phase 002F.3C.4B) - convert currency_code to currency_id
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [currencyCode, setCurrencyCode] = useState<string | null>(null);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  
  // Load currency ID from currency code
  useEffect(() => {
    async function loadCurrencyId() {
      const code = organization?.default_currency;
      if (!code) {
        setCurrencyId(null);
        setCurrencyCode(null);
        return;
      }
      
      try {
        setCurrencyLoading(true);
        const supabase = createClient();
        const { data, error } = await supabase
          .from("currencies")
          .select("id, currency_code")
          .eq("currency_code", code)
          .eq("is_active", true)
          .single();
        
        if (data) {
          setCurrencyId(data.id);
          setCurrencyCode(data.currency_code);
        } else {
          // Currency code not found or inactive, store the code for fallback
          setCurrencyCode(code);
        }
      } catch (err) {
        console.warn("Failed to resolve currency code:", code, err);
        setCurrencyCode(code);
      } finally {
        setCurrencyLoading(false);
      }
    }
    
    if (open && organization) {
      loadCurrencyId();
    } else if (open && !organization) {
      // For new organizations, default to AED if available
      async function loadDefaultCurrency() {
        try {
          setCurrencyLoading(true);
          const supabase = createClient();
          const { data } = await supabase
            .from("currencies")
            .select("id, currency_code")
            .eq("currency_code", "AED")
            .eq("is_active", true)
            .single();
          
          if (data) {
            setCurrencyId(data.id);
            setCurrencyCode("AED");
          }
        } catch {
          // AED not found, leave blank
        } finally {
          setCurrencyLoading(false);
        }
      }
      loadDefaultCurrency();
    }
  }, [open, organization]);
  
  // Reset geography state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setCountryId(organization?.country_id ?? null);
      setEmirateId(organization?.emirate_id ?? null);
      setCityId(organization?.city_id ?? null);
      setAreaZoneId(organization?.area_zone_id ?? null);
    } else {
      // Reset currency state when dialog closes
      setCurrencyId(null);
      setCurrencyCode(null);
    }
  }, [open, organization]);

  const handleCountryChange = (id: number | null) => {
    setCountryId(id);
    setEmirateId(null);
    setCityId(null);
    setAreaZoneId(null);
  };

  const handleEmirateChange = async (id: number | null) => {
    setEmirateId(id);
    setCityId(null);
    setAreaZoneId(null);
    
    // Phase 002F.3C.4B: Resolve emirate ID to name for legacy field sync
    if (id === null) {
      setEmirateName(null);
      return;
    }
    
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("emirates")
        .select("name_en")
        .eq("id", id)
        .single();
      
      if (data) {
        setEmirateName(data.name_en);
      }
    } catch (err) {
      console.warn("Failed to resolve emirate name:", id, err);
    }
  };

  const handleCityChange = (id: number | null) => {
    setCityId(id);
    setAreaZoneId(null);
  };

  const handleCurrencyChange = async (id: number | null) => {
    setCurrencyId(id);
    if (id === null) {
      setCurrencyCode(null);
      return;
    }
    
    // Resolve currency ID to code for database storage
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("currencies")
        .select("currency_code")
        .eq("id", id)
        .single();
      
      if (data) {
        setCurrencyCode(data.currency_code);
      }
    } catch (err) {
      console.warn("Failed to resolve currency ID:", id, err);
    }
  };

  const sections = [
    { id: "basic", label: "Basic Info", icon: Building2 },
    { id: "address", label: "Address & Contact", icon: MapPin },
    { id: "legal", label: "Legal & Licensing", icon: ShieldCheck },
    { id: "tax", label: "Tax & Compliance", icon: FileCode2 },
    { id: "notes", label: "Internal Notes", icon: ScrollText },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);

    const form = document.getElementById(formId) as HTMLFormElement;
    const formData = new FormData(form);
    
    // Build data object with all Phase 002D fields and Phase 002F.3C.1B.1 geography FK fields
    const data = {
      // Basic Information
      legal_name_en: formData.get("legal_name_en") as string,
      legal_name_ar: (formData.get("legal_name_ar") as string) || null,
      short_name: (formData.get("short_name") as string) || null,
      // Only include company_code for new organizations (disabled field doesn't submit)
      ...(isEditing ? {} : { company_code: formData.get("company_code") as string }),
      legal_form: (formData.get("legal_form") as string) || null,
      // Preserve legacy country text on edit; structured country_id is the source of truth
      country: isEditing ? (organization?.country ?? null) : null,
      status: (formData.get("status") as "active" | "inactive" | "suspended") || "active",
      // Phase 002F.3C.4B: Use currency code from resolved currency ID
      default_currency: currencyCode || "AED",
      
      // Geography FK Fields (Phase 002F.3C.1B.1)
      country_id: countryId,
      emirate_id: emirateId,
      city_id: cityId,
      area_zone_id: areaZoneId,
      
      // Address & Contact — Phase 002F.3C.4B: sync legacy text fields with FK names
      emirate: emirateName || (isEditing ? (organization?.emirate ?? null) : null),
      city: isEditing ? (organization?.city ?? null) : null,
      area: isEditing ? (organization?.area ?? null) : null,
      address_line_1: (formData.get("address_line_1") as string) || null,
      address_line_2: (formData.get("address_line_2") as string) || null,
      po_box: (formData.get("po_box") as string) || null,
      makani_number: (formData.get("makani_number") as string) || null,
      primary_email: (formData.get("primary_email") as string) || null,
      primary_phone: (formData.get("primary_phone") as string) || null,
      website: (formData.get("website") as string) || null,
      
      // Legal & Licensing
      trade_license_no: (formData.get("trade_license_no") as string) || null,
      trade_license_issue_date: (formData.get("trade_license_issue_date") as string) || null,
      trade_license_expiry_date: (formData.get("trade_license_expiry_date") as string) || null,
      licensing_authority: (formData.get("licensing_authority") as string) || null,
      chamber_membership_no: (formData.get("chamber_membership_no") as string) || null,
      chamber_membership_expiry_date: (formData.get("chamber_membership_expiry_date") as string) || null,
      
      // Tax & Compliance
      trn: (formData.get("trn") as string) || null,
      vat_registered: formData.get("vat_registered") === "on",
      corporate_tax_no: (formData.get("corporate_tax_no") as string) || null,
      corporate_tax_registered: formData.get("corporate_tax_registered") === "on",
      icv_certificate_no: (formData.get("icv_certificate_no") as string) || null,
      icv_score: formData.get("icv_score") ? Number(formData.get("icv_score")) : null,
      icv_issue_date: (formData.get("icv_issue_date") as string) || null,
      icv_expiry_date: (formData.get("icv_expiry_date") as string) || null,
      adnoc_supplier_no: (formData.get("adnoc_supplier_no") as string) || null,
      
      // Other
      logo_url: (formData.get("logo_url") as string) || null,
      notes: (formData.get("notes") as string) || null,
    };

    try {
      const result = isEditing && organization
        ? await updateOrganization({ ...data, id: organization.id } as any)
        : await createOrganization({ ...data, company_code: formData.get("company_code") as string });

      if (result.success) {
        toast.success(isEditing ? "Organization updated" : "Organization created");
        resetDirty();
        return true;
      } else {
        toast.error(result.error || "Failed to save organization");
        return false;
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndClose = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    const success = await handleSave();
    if (success) {
      onOpenChange(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Default form submission is "Save & Close"
    await handleSaveAndClose();
  };

  return (
    <ERPDrawerForm
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit Organization Profile" : "Create Organization Profile"}
      subtitle={isEditing ? `Modify structural credentials for ${organization?.legal_name_en}` : "Register a new legal corporate company"}
      mode={isEditing ? "edit" : "add"}
      recordNumber={organization?.company_code}
      status={organization?.status}
      isDirty={isDirty}
      onPrint={() => window.print()}
      onExportPDF={() => toast.info("PDF export initiated...")}
      onExportExcel={() => toast.info("Excel export initiated...")}
      onExportCSV={() => toast.info("CSV export initiated...")}
      onSendEmail={() => toast.info("Email share panel will trigger in next release.")}
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-1 overflow-hidden h-full">
        {/* Left Side Section Nav */}
        <ERPDrawerSectionNav
          sections={sections}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          auditInfo={isEditing ? {
            updatedAt: "Recent update",
            updatedBy: "System Admin"
          } : undefined}
        />

        {/* Right Side Content Canvas */}
        <div className="flex-grow flex flex-col justify-between overflow-hidden">
          <ERPDrawerBody>
            {/* Section 1: Basic Information */}
            <ERPDrawerSection id="basic" activeId={activeSection} title="Basic Identification">
              <ERPFieldGrid>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="legal_name_en" className="text-muted-foreground text-xs" required>
                    Legal Name (English)
                  </RequiredLabel>
                  <Input
                    id="legal_name_en"
                    name="legal_name_en"
                    className="h-9 text-xs"
                    defaultValue={organization?.legal_name_en}
                    required
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="legal_name_ar" className="text-muted-foreground text-xs">
                    Legal Name (Arabic)
                  </RequiredLabel>
                  <Input
                    id="legal_name_ar"
                    name="legal_name_ar"
                    className="h-9 text-xs"
                    defaultValue={organization?.legal_name_ar ?? ""}
                  />
                </div>
                <div className="col-span-4 space-y-1.5">
                  <RequiredLabel htmlFor="company_code" className="text-muted-foreground text-xs" required>
                    Company Code
                  </RequiredLabel>
                  <Input
                    id="company_code"
                    name="company_code"
                    className="h-9 text-xs uppercase"
                    defaultValue={organization?.company_code}
                    disabled={isEditing}
                    required
                    placeholder="e.g., ALGT, ALS, PGI"
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Short business code used across the ERP (e.g., ALGT, ALS, PGI, AET)
                  </span>
                </div>
                <div className="col-span-4 space-y-1.5">
                  <RequiredLabel htmlFor="short_name" className="text-muted-foreground text-xs">
                    Short Name
                  </RequiredLabel>
                  <Input
                    id="short_name"
                    name="short_name"
                    className="h-9 text-xs"
                    defaultValue={organization?.short_name ?? ""}
                  />
                </div>
                <div className="col-span-4 space-y-1.5">
                  <RequiredLabel htmlFor="legal_form" className="text-muted-foreground text-xs">
                    Legal Form
                  </RequiredLabel>
                  <Input
                    id="legal_form"
                    name="legal_form"
                    className="h-9 text-xs"
                    defaultValue={organization?.legal_form ?? ""}
                    placeholder="LLC, FZC, Branch"
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="default_currency" className="text-muted-foreground text-xs">Default Currency</Label>
                  <CurrencySelect
                    value={currencyId}
                    onValueChange={handleCurrencyChange}
                    placeholder="Select currency..."
                    className="h-9 text-xs"
                    showCode={true}
                    disabled={currencyLoading}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Used as the default commercial/reporting currency for this organization.
                  </span>
                  {organization?.default_currency && !currencyId && !currencyLoading && (
                    <p className="text-[9px] text-amber-600">
                      Legacy Currency: {organization.default_currency}
                    </p>
                  )}
                </div>
                <div className="col-span-4 space-y-1.5">
                  <Label htmlFor="status" className="text-muted-foreground text-xs">Status</Label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={organization?.status || "active"}
                    className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 2: Address & Contact */}
            <ERPDrawerSection id="address" activeId={activeSection} title="Address & Office Location">
              <ERPFieldGrid>
                {/* Geography FK Fields (Phase 002F.3C.1B.1) */}
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="country_id" className="text-muted-foreground text-xs">Country</Label>
                  <CountrySelect
                    value={countryId}
                    onValueChange={handleCountryChange}
                    placeholder="Select Country"
                    className="h-9 text-xs"
                  />
                  {organization?.country && !countryId && (
                    <p className="text-[9px] text-amber-600">
                      Legacy Country: {organization.country}
                    </p>
                  )}
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="emirate_id" className="text-muted-foreground text-xs">Region / Emirate / Governorate</Label>
                  <EmirateSelect
                    value={emirateId}
                    onValueChange={handleEmirateChange}
                    countryId={countryId}
                    placeholder="Select Region / Emirate"
                    className="h-9 text-xs"
                    disabled={!countryId}
                  />
                  {organization?.emirate && !emirateId && (
                    <p className="text-[9px] text-amber-600">
                      Legacy: {organization.emirate}
                    </p>
                  )}
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="city_id" className="text-muted-foreground text-xs">City</Label>
                  <CitySelect
                    value={cityId}
                    onValueChange={handleCityChange}
                    emirateId={emirateId}
                    placeholder="Select City"
                    className="h-9 text-xs"
                    disabled={!emirateId}
                  />
                  {organization?.city && !cityId && (
                    <p className="text-[9px] text-amber-600">
                      Legacy: {organization.city}
                    </p>
                  )}
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="area_zone_id" className="text-muted-foreground text-xs">Area / Zone</Label>
                  <AreaZoneSelect
                    value={areaZoneId}
                    onValueChange={setAreaZoneId}
                    cityId={cityId}
                    placeholder="Select Area / Zone"
                    className="h-9 text-xs"
                    disabled={!cityId}
                  />
                  {organization?.area && !areaZoneId && (
                    <p className="text-[9px] text-amber-600">
                      Legacy: {organization.area}
                    </p>
                  )}
                </div>
                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="address_line_1" className="text-muted-foreground text-xs">Address Line 1</Label>
                  <Input
                    id="address_line_1"
                    name="address_line_1"
                    className="h-9 text-xs"
                    defaultValue={organization?.address_line_1 ?? ""}
                  />
                </div>
                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="address_line_2" className="text-muted-foreground text-xs">Address Line 2</Label>
                  <Input
                    id="address_line_2"
                    name="address_line_2"
                    className="h-9 text-xs"
                    defaultValue={organization?.address_line_2 ?? ""}
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="po_box" className="text-muted-foreground text-xs">PO Box</Label>
                  <Input id="po_box" name="po_box" className="h-9 text-xs" defaultValue={organization?.po_box ?? ""} />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="makani_number" className="text-muted-foreground text-xs">Makani Number</Label>
                  <Input
                    id="makani_number"
                    name="makani_number"
                    className="h-9 text-xs"
                    defaultValue={organization?.makani_number ?? ""}
                    placeholder="UAE Makani address"
                  />
                </div>
                <div className="col-span-4 space-y-1.5">
                  <Label htmlFor="primary_email" className="text-muted-foreground text-xs">Primary Email</Label>
                  <Input
                    type="email"
                    id="primary_email"
                    name="primary_email"
                    className="h-9 text-xs"
                    defaultValue={organization?.primary_email ?? ""}
                  />
                </div>
                <div className="col-span-4 space-y-1.5">
                  <Label htmlFor="primary_phone" className="text-muted-foreground text-xs">Primary Phone</Label>
                  <Input
                    id="primary_phone"
                    name="primary_phone"
                    className="h-9 text-xs"
                    defaultValue={organization?.primary_phone ?? ""}
                  />
                </div>
                <div className="col-span-4 space-y-1.5">
                  <Label htmlFor="website" className="text-muted-foreground text-xs">Website</Label>
                  <Input
                    type="url"
                    id="website"
                    name="website"
                    className="h-9 text-xs"
                    defaultValue={organization?.website ?? ""}
                    placeholder="https://example.com"
                  />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 3: Legal & Licensing */}
            <ERPDrawerSection id="legal" activeId={activeSection} title="Trade Registration & Licensing">
              <ERPFieldGrid>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="trade_license_no" className="text-muted-foreground text-xs">Trade License Number</Label>
                  <Input
                    id="trade_license_no"
                    name="trade_license_no"
                    className="h-9 text-xs"
                    defaultValue={organization?.trade_license_no ?? ""}
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="licensing_authority" className="text-muted-foreground text-xs">Licensing Authority</Label>
                  <Input
                    id="licensing_authority"
                    name="licensing_authority"
                    className="h-9 text-xs"
                    defaultValue={organization?.licensing_authority ?? ""}
                    placeholder="DED, FTZ, etc."
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="trade_license_issue_date" className="text-muted-foreground text-xs">License Issue Date</Label>
                  <Input
                    type="date"
                    id="trade_license_issue_date"
                    name="trade_license_issue_date"
                    className="h-9 text-xs"
                    defaultValue={organization?.trade_license_issue_date ?? ""}
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="trade_license_expiry_date" className="text-muted-foreground text-xs">License Expiry Date</Label>
                  <Input
                    type="date"
                    id="trade_license_expiry_date"
                    name="trade_license_expiry_date"
                    className="h-9 text-xs"
                    defaultValue={organization?.trade_license_expiry_date ?? ""}
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="chamber_membership_no" className="text-muted-foreground text-xs">Chamber Membership Number</Label>
                  <Input
                    id="chamber_membership_no"
                    name="chamber_membership_no"
                    className="h-9 text-xs"
                    defaultValue={organization?.chamber_membership_no ?? ""}
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="chamber_membership_expiry_date" className="text-muted-foreground text-xs">Chamber Expiry Date</Label>
                  <Input
                    type="date"
                    id="chamber_membership_expiry_date"
                    name="chamber_membership_expiry_date"
                    className="h-9 text-xs"
                    defaultValue={organization?.chamber_membership_expiry_date ?? ""}
                  />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 4: Tax & Compliance */}
            <ERPDrawerSection id="tax" activeId={activeSection} title="Tax & ICV Compliance">
              <ERPFieldGrid>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="trn" className="text-muted-foreground text-xs">Tax Registration Number (TRN)</Label>
                  <Input id="trn" name="trn" className="h-9 text-xs" defaultValue={organization?.trn ?? ""} />
                </div>
                <div className="col-span-6 flex items-center space-x-2 pt-6">
                  <Checkbox
                    id="vat_registered"
                    name="vat_registered"
                    defaultChecked={organization?.vat_registered ?? true}
                    className="border-input bg-background text-foreground data-[state=checked]:bg-indigo-600 data-[state=checked]:text-white"
                  />
                  <Label htmlFor="vat_registered" className="cursor-pointer text-muted-foreground text-xs font-normal">
                    VAT Registered
                  </Label>
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="corporate_tax_no" className="text-muted-foreground text-xs">Corporate Tax Number</Label>
                  <Input
                    id="corporate_tax_no"
                    name="corporate_tax_no"
                    className="h-9 text-xs"
                    defaultValue={organization?.corporate_tax_no ?? ""}
                  />
                </div>
                <div className="col-span-6 flex items-center space-x-2 pt-6">
                  <Checkbox
                    id="corporate_tax_registered"
                    name="corporate_tax_registered"
                    defaultChecked={organization?.corporate_tax_registered ?? false}
                    className="border-input bg-background text-foreground data-[state=checked]:bg-indigo-600 data-[state=checked]:text-white"
                  />
                  <Label htmlFor="corporate_tax_registered" className="cursor-pointer text-muted-foreground text-xs font-normal">
                    Corporate Tax Registered
                  </Label>
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="icv_certificate_no" className="text-muted-foreground text-xs">ICV Certificate Number</Label>
                  <Input
                    id="icv_certificate_no"
                    name="icv_certificate_no"
                    className="h-9 text-xs"
                    defaultValue={organization?.icv_certificate_no ?? ""}
                    placeholder="In-Country Value certificate"
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="icv_score" className="text-muted-foreground text-xs">ICV Score (0-100)</Label>
                  <Input
                    type="number"
                    id="icv_score"
                    name="icv_score"
                    min="0"
                    max="100"
                    step="0.01"
                    className="h-9 text-xs"
                    defaultValue={organization?.icv_score ?? ""}
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="icv_issue_date" className="text-muted-foreground text-xs">ICV Issue Date</Label>
                  <Input
                    type="date"
                    id="icv_issue_date"
                    name="icv_issue_date"
                    className="h-9 text-xs"
                    defaultValue={organization?.icv_issue_date ?? ""}
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="icv_expiry_date" className="text-muted-foreground text-xs">ICV Expiry Date</Label>
                  <Input
                    type="date"
                    id="icv_expiry_date"
                    name="icv_expiry_date"
                    className="h-9 text-xs"
                    defaultValue={organization?.icv_expiry_date ?? ""}
                  />
                </div>
                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="adnoc_supplier_no" className="text-muted-foreground text-xs">ADNOC Supplier Number</Label>
                  <Input
                    id="adnoc_supplier_no"
                    name="adnoc_supplier_no"
                    className="h-9 text-xs"
                    defaultValue={organization?.adnoc_supplier_no ?? ""}
                    placeholder="ADNOC supplier registration number"
                  />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 5: Notes & Other */}
            <ERPDrawerSection id="notes" activeId={activeSection} title="Notes & Corporate Logo">
              <ERPFieldGrid>
                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="logo_url" className="text-muted-foreground text-xs">Logo URL</Label>
                  <Input
                    type="url"
                    id="logo_url"
                    name="logo_url"
                    className="h-9 text-xs"
                    defaultValue={organization?.logo_url ?? ""}
                    placeholder="https://example.com/logo.png"
                  />
                </div>
                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    className="text-xs"
                    defaultValue={organization?.notes ?? ""}
                    rows={6}
                    placeholder="Internal notes about this organization..."
                  />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>
          </ERPDrawerBody>

          {/* Sticky Footer */}
          <ERPFormFooter
            mode={isEditing ? "edit" : "add"}
            formId={formId}
            onCancel={() => onOpenChange(false)}
            onSave={() => handleSave()}
            onSaveAndClose={() => handleSaveAndClose()}
            isSubmitting={isSubmitting}
            hasUnsavedChanges={isDirty}
          />
        </div>
      </form>
    </ERPDrawerForm>
  );
}
