"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Customer } from "@/features/master-data/customers/types";
import type { AuthContext } from "@/lib/rbac/check";
import { createCustomer, updateCustomer } from "@/server/actions/master-data/customers";
import { CountrySelect, EmirateSelect, CitySelect, AreaZoneSelect } from "@/components/erp/geography";
import { CurrencySelect, PaymentTermSelect, TaxTypeSelect } from "@/components/erp/finance-basics";
import { LookupSelect } from "@/components/erp/lookup-select";
import { RequiredLabel } from "@/components/erp/required-label";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import {
  Building2,
  MapPin,
  Users,
  DollarSign,
  Award,
  FileText,
  Info,
} from "lucide-react";
import { format } from "date-fns";
import { CustomerContactsSection } from "./customer-contacts-section";
import { CustomerAddressesSection } from "./customer-addresses-section";
import { CustomerBankDetailsSection } from "./customer-bank-details-section";
import { useFormDirty } from "@/hooks/use-form-dirty";

type CustomerFormDrawerProps = {
  customer?: Customer | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authContext: AuthContext;
};

export function CustomerFormDrawer(props: CustomerFormDrawerProps) {
  if (!props.open) return null;
  return <CustomerFormDrawerInner key={`${props.mode}-${props.customer?.id ?? "new"}`} {...props} />;
}

function CustomerFormDrawerInner({ customer, mode, open, onOpenChange }: Omit<CustomerFormDrawerProps, "authContext">) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");

  // Track which sections have been activated at least once.
  // Starts with "basic" pre-mounted. Used to guard child CRUD sub-components
  // inside mixed sections (location, finance) where the section itself must
  // stay always-mounted for FormData safety, but the child CRUD can be lazy.
  const [mountedSections, setMountedSections] = useState<Set<string>>(
    () => new Set(["basic"])
  );

  const handleSectionChange = useCallback((id: string) => {
    setActiveSection(id);
    setMountedSections(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const currentCustomer = customer; // Keep reference to original customer prop
  const [currentMode, setCurrentMode] = useState<"add" | "edit" | "view">(mode);
  const [createdCustomerId, setCreatedCustomerId] = useState<number | null>(null);
  const isEditing = currentMode === "edit";
  const isViewing = currentMode === "view";

  // 3B.7 fix: after Add → Save (drawer stays open), child sections must unlock
  // using the newly created id, not just the original customer prop.
  const effectiveCustomerId = currentCustomer?.id ?? createdCustomerId;

  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: "customer-form",
    enabled: !isViewing, // Only track dirty in Add/Edit modes
  });

  // Geography state for cascading
  const [countryId, setCountryId] = useState<number | null>(currentCustomer?.country_id ?? null);
  const [emirateId, setEmirateId] = useState<number | null>(currentCustomer?.emirate_id ?? null);
  const [cityId, setCityId] = useState<number | null>(currentCustomer?.city_id ?? null);
  const [areaZoneId, setAreaZoneId] = useState<number | null>(currentCustomer?.area_zone_id ?? null);

  // Finance state
  const [currencyId, setCurrencyId] = useState<number | null>(currentCustomer?.currency_id ?? null);
  const [paymentTermId, setPaymentTermId] = useState<number | null>(currentCustomer?.payment_term_id ?? null);
  const [taxTypeId, setTaxTypeId] = useState<number | null>(currentCustomer?.tax_type_id ?? null);

  // Lookup state
  const [customerTypeCode, setCustomerTypeCode] = useState<string | null>(currentCustomer?.customer_type_code ?? null);
  const [industryTypeCode, setIndustryTypeCode] = useState<string | null>(currentCustomer?.industry_type_code ?? null);
  const [customerSegmentCode, setCustomerSegmentCode] = useState<string | null>(currentCustomer?.customer_segment_code ?? null);
  const [leadSourceCode, setLeadSourceCode] = useState<string | null>(currentCustomer?.lead_source_code ?? null);
  const [statusCode, setStatusCode] = useState<string | null>(currentCustomer?.status_code ?? "ACTIVE");
  const [icvStatusCode, setIcvStatusCode] = useState<string | null>(currentCustomer?.icv_status_code ?? null);

  const sections = [
    { id: "basic", label: "Basic Info", icon: Building2 },
    { id: "location", label: "Address / Location", icon: MapPin },
    { id: "contacts", label: "Contacts", icon: Users },
    { id: "finance", label: "Commercial / Finance", icon: DollarSign },
    { id: "compliance", label: "UAE Compliance", icon: Award },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "audit", label: "Audit / System Info", icon: Info },
  ];

  const handleSave = async () => {
    if (isViewing) return false;

    setIsSubmitting(true);
    const form = document.getElementById("customer-form") as HTMLFormElement | null;
    if (!form) {
      setIsSubmitting(false);
      return false;
    }

    const formData = new FormData(form);

    try {
      const shared = {
        customer_name_en: formData.get("customer_name_en") as string,
        customer_name_ar: (formData.get("customer_name_ar") as string) || null,
        customer_type_code: customerTypeCode!,
        industry_type_code: industryTypeCode,
        customer_segment_code: customerSegmentCode,
        lead_source_code: leadSourceCode,
        trn: (formData.get("trn") as string) || null,
        trade_license_number: (formData.get("trade_license_number") as string) || null,
        license_expiry_date: (formData.get("license_expiry_date") as string) || null,
        website_url: (formData.get("website_url") as string) || null,
        primary_email: (formData.get("primary_email") as string) || null,
        primary_phone: (formData.get("primary_phone") as string) || null,
        primary_mobile: (formData.get("primary_mobile") as string) || null,
        country_id: countryId,
        emirate_id: emirateId,
        city_id: cityId,
        area_zone_id: areaZoneId,
        address_line_1: (formData.get("address_line_1") as string) || null,
        address_line_2: (formData.get("address_line_2") as string) || null,
        po_box: (formData.get("po_box") as string) || null,
        makani_number: (formData.get("makani_number") as string) || null,
        currency_id: currencyId,
        payment_term_id: paymentTermId,
        tax_type_id: taxTypeId,
        credit_limit: formData.get("credit_limit") ? parseFloat(formData.get("credit_limit") as string) : null,
        credit_days: formData.get("credit_days") ? parseInt(formData.get("credit_days") as string) : null,
        sales_owner_user_profile_id: null,
        icv_certificate_number: (formData.get("icv_certificate_number") as string) || null,
        icv_score_percentage: formData.get("icv_score_percentage") ? parseFloat(formData.get("icv_score_percentage") as string) : null,
        icv_issue_date: (formData.get("icv_issue_date") as string) || null,
        icv_expiry_date: (formData.get("icv_expiry_date") as string) || null,
        icv_company_type: (formData.get("icv_company_type") as string) || null,
        icv_financial_year_end_date: (formData.get("icv_financial_year_end_date") as string) || null,
        icv_certification_body: (formData.get("icv_certification_body") as string) || null,
        icv_version: (formData.get("icv_version") as string) || null,
        icv_status_code: icvStatusCode,
        cicpa_registration_number: (formData.get("cicpa_registration_number") as string) || null,
        notes: (formData.get("notes") as string) || null,
        status_code: statusCode!,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
      };

      let result;
      if (isEditing && (currentCustomer || createdCustomerId)) {
        const customerId = currentCustomer?.id ?? createdCustomerId!;
        result = await updateCustomer({ id: customerId, ...shared, is_active: statusCode === "ACTIVE" });
      } else {
        result = await createCustomer(shared);
      }

      if (result.success) {
        toast.success(`Customer ${isEditing ? "updated" : "created"} successfully`);
        
        // Reset dirty state after successful save
        resetDirty();
        
        // Prevent duplicate creation by tracking the created customer ID and switching to edit mode
        if (!isEditing && result.data && 'id' in result.data) {
          setCreatedCustomerId(result.data.id);
          setCurrentMode("edit");
        }
        
        return true;
      } else {
        toast.error(result.error ?? "Failed to save customer");
        return false;
      }
    } catch (error) {
      console.error("Form submission error", error);
      toast.error("An unexpected error occurred");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndClose = async () => {
    const success = await handleSave();
    if (success) {
      onOpenChange(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isViewing) {
      onOpenChange(false);
      return;
    }
    await handleSaveAndClose(); // Enter key triggers Save & Close
  };

  return (
    <ERPDrawerForm
      open={open}
      onOpenChange={onOpenChange}
      title={isViewing ? "View Customer" : isEditing ? "Edit Customer" : "Add Customer"}
      subtitle={currentCustomer ? currentCustomer.customer_code : undefined}
      mode={currentMode}
      status={currentCustomer?.is_active ? "Active" : "Inactive"}
      recordNumber={currentCustomer?.customer_code}
      isDirty={isDirty}
    >
      <ERPDrawerSectionNav
        sections={sections}
        activeSection={activeSection}
        setActiveSection={handleSectionChange}
      />
      
      <form id="customer-form" onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
        <ERPDrawerBody>
          {/* Tab 1: Basic Information */}
          <ERPDrawerSection id="basic" activeId={activeSection} title="Basic Information">
            <ERPFieldGrid>
              <div className="col-span-6">
                <Label htmlFor="customer_code">Customer Code</Label>
                <Input
                  id="customer_code"
                  name="customer_code"
                  defaultValue={currentCustomer?.customer_code}
                  disabled
                  placeholder={isEditing ? currentCustomer?.customer_code : "Auto-generated on save"}
                  className="font-mono"
                />
                {!isEditing && <p className="text-xs text-muted-foreground mt-1">Auto-generated on save</p>}
              </div>

              <div className="col-span-6">
                <RequiredLabel htmlFor="customer_name_en" required={true}>Customer Name (English)</RequiredLabel>
                <Input
                  id="customer_name_en"
                  name="customer_name_en"
                  defaultValue={currentCustomer?.customer_name_en}
                  required
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="customer_name_ar">Customer Name (Arabic)</Label>
                <Input
                  id="customer_name_ar"
                  name="customer_name_ar"
                  defaultValue={currentCustomer?.customer_name_ar ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <RequiredLabel htmlFor="customer_type_code" required={true}>Customer Type</RequiredLabel>
                <LookupSelect
                  categoryCode="CUSTOMER_TYPES"
                  value={customerTypeCode}
                  onValueChange={(v) => setCustomerTypeCode(v as string | null)}
                  disabled={isViewing}
                  placeholder="Select customer type"
                  valueField="code"
                  required
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="industry_type_code">Industry Type</Label>
                <LookupSelect
                  categoryCode="INDUSTRY_TYPES"
                  value={industryTypeCode}
                  onValueChange={(v) => setIndustryTypeCode(v as string | null)}
                  disabled={isViewing}
                  placeholder="Select industry type"
                  valueField="code"
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="customer_segment_code">Customer Segment</Label>
                <LookupSelect
                  categoryCode="CUSTOMER_SEGMENTS"
                  value={customerSegmentCode}
                  onValueChange={(v) => setCustomerSegmentCode(v as string | null)}
                  disabled={isViewing}
                  placeholder="Select customer segment"
                  valueField="code"
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="lead_source_code">Lead Source</Label>
                <LookupSelect
                  categoryCode="CRM_LEAD_SOURCES"
                  value={leadSourceCode}
                  onValueChange={(v) => setLeadSourceCode(v as string | null)}
                  disabled={isViewing}
                  placeholder="Select lead source"
                  valueField="code"
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="trn">TRN (15 digits)</Label>
                <Input
                  id="trn"
                  name="trn"
                  defaultValue={currentCustomer?.trn ?? ""}
                  disabled={isViewing}
                  maxLength={15}
                  className="font-mono"
                  placeholder="123456789012345"
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="trade_license_number">Trade License Number</Label>
                <Input
                  id="trade_license_number"
                  name="trade_license_number"
                  defaultValue={currentCustomer?.trade_license_number ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="license_expiry_date">License Expiry Date</Label>
                <Input
                  id="license_expiry_date"
                  name="license_expiry_date"
                  type="date"
                  defaultValue={currentCustomer?.license_expiry_date ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="website_url">Website URL</Label>
                <Input
                  id="website_url"
                  name="website_url"
                  type="url"
                  defaultValue={currentCustomer?.website_url ?? ""}
                  disabled={isViewing}
                  placeholder="https://example.com"
                />
              </div>

              <div className="col-span-4">
                <Label htmlFor="primary_email">Primary Email</Label>
                <Input
                  id="primary_email"
                  name="primary_email"
                  type="email"
                  defaultValue={currentCustomer?.primary_email ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-4">
                <Label htmlFor="primary_phone">Primary Phone</Label>
                <Input
                  id="primary_phone"
                  name="primary_phone"
                  defaultValue={currentCustomer?.primary_phone ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-4">
                <Label htmlFor="primary_mobile">Primary Mobile</Label>
                <Input
                  id="primary_mobile"
                  name="primary_mobile"
                  defaultValue={currentCustomer?.primary_mobile ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <RequiredLabel htmlFor="status_code" required={true}>Status</RequiredLabel>
                <LookupSelect
                  categoryCode="PARTY_STATUS_TYPES"
                  value={statusCode}
                  onValueChange={(v) => setStatusCode(v as string | null)}
                  disabled={isViewing}
                  placeholder="Select status"
                  valueField="code"
                  required
                />
              </div>

              <div className="col-span-12">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  defaultValue={currentCustomer?.notes ?? ""}
                  disabled={isViewing}
                  rows={3}
                />
              </div>
            </ERPFieldGrid>
          </ERPDrawerSection>

          {/* Tab 2: Address / Location */}
          <ERPDrawerSection id="location" activeId={activeSection} title="Address / Location">
            <ERPFieldGrid>
              <div className="col-span-6">
                <Label htmlFor="country_id">Country</Label>
                <CountrySelect
                  value={countryId}
                  onValueChange={(value) => {
                    setCountryId(value);
                    setEmirateId(null);
                    setCityId(null);
                    setAreaZoneId(null);
                  }}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="emirate_id">Emirate</Label>
                <EmirateSelect
                  countryId={countryId}
                  value={emirateId}
                  onValueChange={(value) => {
                    setEmirateId(value);
                    setCityId(null);
                    setAreaZoneId(null);
                  }}
                  disabled={isViewing || !countryId}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="city_id">City</Label>
                <CitySelect
                  emirateId={emirateId}
                  value={cityId}
                  onValueChange={(value) => {
                    setCityId(value);
                    setAreaZoneId(null);
                  }}
                  disabled={isViewing || !emirateId}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="area_zone_id">Area / Zone</Label>
                <AreaZoneSelect
                  cityId={cityId}
                  value={areaZoneId}
                  onValueChange={setAreaZoneId}
                  disabled={isViewing || !cityId}
                />
              </div>

              <div className="col-span-12">
                <Label htmlFor="address_line_1">Address Line 1</Label>
                <Input
                  id="address_line_1"
                  name="address_line_1"
                  defaultValue={currentCustomer?.address_line_1 ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-12">
                <Label htmlFor="address_line_2">Address Line 2</Label>
                <Input
                  id="address_line_2"
                  name="address_line_2"
                  defaultValue={currentCustomer?.address_line_2 ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="po_box">PO Box</Label>
                <Input
                  id="po_box"
                  name="po_box"
                  defaultValue={currentCustomer?.po_box ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="makani_number">Makani Number</Label>
                <Input
                  id="makani_number"
                  name="makani_number"
                  defaultValue={currentCustomer?.makani_number ?? ""}
                  disabled={isViewing}
                />
              </div>
            </ERPFieldGrid>

            {effectiveCustomerId !== null && mountedSections.has("location") && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold mb-3">Additional Addresses</h4>
                <CustomerAddressesSection customerId={effectiveCustomerId} disabled={isViewing} />
              </div>
            )}
          </ERPDrawerSection>

          {/* Tab 3: Contacts — lazyMount: pure child CRUD, no FormData inputs */}
          <ERPDrawerSection id="contacts" activeId={activeSection} title="Contacts" lazyMount>
            {effectiveCustomerId !== null ? (
              <CustomerContactsSection customerId={effectiveCustomerId} disabled={isViewing} />
            ) : (
              <div className="text-sm text-muted-foreground">Save customer first to add contacts</div>
            )}
          </ERPDrawerSection>

          {/* Tab 4: Commercial / Finance */}
          <ERPDrawerSection id="finance" activeId={activeSection} title="Commercial / Finance">
            <ERPFieldGrid>
              <div className="col-span-6">
                <Label htmlFor="currency_id">Currency</Label>
                <CurrencySelect
                  value={currencyId}
                  onValueChange={setCurrencyId}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="payment_term_id">Payment Term</Label>
                <PaymentTermSelect
                  value={paymentTermId}
                  onValueChange={setPaymentTermId}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="tax_type_id">Tax Type</Label>
                <TaxTypeSelect
                  value={taxTypeId}
                  onValueChange={setTaxTypeId}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="credit_limit">Credit Limit</Label>
                <Input
                  id="credit_limit"
                  name="credit_limit"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={currentCustomer?.credit_limit ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="credit_days">Credit Days</Label>
                <Input
                  id="credit_days"
                  name="credit_days"
                  type="number"
                  min="0"
                  defaultValue={currentCustomer?.credit_days ?? ""}
                  disabled={isViewing}
                />
              </div>
            </ERPFieldGrid>

            {effectiveCustomerId !== null && mountedSections.has("finance") && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold mb-3">Bank Details</h4>
                <CustomerBankDetailsSection customerId={effectiveCustomerId} disabled={isViewing} />
              </div>
            )}
          </ERPDrawerSection>

          {/* Tab 5: UAE Compliance */}
          <ERPDrawerSection id="compliance" activeId={activeSection} title="UAE Compliance">
            <ERPFieldGrid>
              <div className="col-span-6">
                <Label htmlFor="icv_certificate_number">ICV Certificate Number</Label>
                <Input
                  id="icv_certificate_number"
                  name="icv_certificate_number"
                  defaultValue={currentCustomer?.icv_certificate_number ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="icv_score_percentage">ICV Score (%)</Label>
                <Input
                  id="icv_score_percentage"
                  name="icv_score_percentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  defaultValue={currentCustomer?.icv_score_percentage ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="icv_issue_date">ICV Issue Date</Label>
                <Input
                  id="icv_issue_date"
                  name="icv_issue_date"
                  type="date"
                  defaultValue={currentCustomer?.icv_issue_date ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="icv_expiry_date">ICV Expiry Date</Label>
                <Input
                  id="icv_expiry_date"
                  name="icv_expiry_date"
                  type="date"
                  defaultValue={currentCustomer?.icv_expiry_date ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="icv_company_type">ICV Company Type</Label>
                <Input
                  id="icv_company_type"
                  name="icv_company_type"
                  defaultValue={currentCustomer?.icv_company_type ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="icv_financial_year_end_date">ICV Financial Year End</Label>
                <Input
                  id="icv_financial_year_end_date"
                  name="icv_financial_year_end_date"
                  type="date"
                  defaultValue={currentCustomer?.icv_financial_year_end_date ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="icv_certification_body">ICV Certification Body</Label>
                <Input
                  id="icv_certification_body"
                  name="icv_certification_body"
                  defaultValue={currentCustomer?.icv_certification_body ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="icv_version">ICV Version</Label>
                <Input
                  id="icv_version"
                  name="icv_version"
                  defaultValue={currentCustomer?.icv_version ?? ""}
                  disabled={isViewing}
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="icv_status_code">ICV Status</Label>
                <LookupSelect
                  categoryCode="ICV_STATUS_TYPES"
                  value={icvStatusCode}
                  onValueChange={(v) => setIcvStatusCode(v as string | null)}
                  disabled={isViewing}
                  placeholder="Select ICV status"
                  valueField="code"
                />
              </div>

              <div className="col-span-6">
                <Label htmlFor="cicpa_registration_number">CICPA Registration Number</Label>
                <Input
                  id="cicpa_registration_number"
                  name="cicpa_registration_number"
                  defaultValue={currentCustomer?.cicpa_registration_number ?? ""}
                  disabled={isViewing}
                />
              </div>
            </ERPFieldGrid>
          </ERPDrawerSection>

          {/* Tab 6: Documents (Placeholder) — lazyMount: static placeholder, no form inputs */}
          <ERPDrawerSection id="documents" activeId={activeSection} title="Documents" lazyMount>
            <div className="rounded-md border border-dashed border-muted-foreground/30 p-8 text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <h4 className="text-sm font-semibold mb-2">Documents Management</h4>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Documents will be managed through the centralized DMS module.
                No upload or document storage is implemented in this phase.
              </p>
            </div>
          </ERPDrawerSection>

          {/* Tab 7: Audit / System Info — lazyMount: display-only, no named form inputs */}
          <ERPDrawerSection id="audit" activeId={activeSection} title="Audit / System Info" lazyMount>
            {currentCustomer ? (
              <ERPFieldGrid>
                <div className="col-span-6">
                  <Label>Created At</Label>
                  <div className="text-sm">{format(new Date(currentCustomer.created_at), "yyyy-MM-dd HH:mm:ss")}</div>
                </div>

                <div className="col-span-6">
                  <Label>Created By</Label>
                  <div className="text-sm">{currentCustomer.created_by ?? "—"}</div>
                </div>

                <div className="col-span-6">
                  <Label>Updated At</Label>
                  <div className="text-sm">{format(new Date(currentCustomer.updated_at), "yyyy-MM-dd HH:mm:ss")}</div>
                </div>

                <div className="col-span-6">
                  <Label>Updated By</Label>
                  <div className="text-sm">{currentCustomer.updated_by ?? "—"}</div>
                </div>

                <div className="col-span-6">
                  <Label>Deactivated At</Label>
                  <div className="text-sm">{currentCustomer.deactivated_at ? format(new Date(currentCustomer.deactivated_at), "yyyy-MM-dd HH:mm:ss") : "—"}</div>
                </div>

                <div className="col-span-6">
                  <Label>Deactivated By</Label>
                  <div className="text-sm">{currentCustomer.deactivated_by ?? "—"}</div>
                </div>

                <div className="col-span-12">
                  <Label>Deactivation Reason</Label>
                  <div className="text-sm">{currentCustomer.deactivation_reason ?? "—"}</div>
                </div>

                <div className="col-span-3">
                  <Label>Is Active</Label>
                  <div><Badge variant={currentCustomer.is_active ? "default" : "secondary"}>{currentCustomer.is_active ? "Yes" : "No"}</Badge></div>
                </div>

                <div className="col-span-3">
                  <Label>Is Locked</Label>
                  <div><Badge variant={currentCustomer.is_locked ? "destructive" : "outline"}>{currentCustomer.is_locked ? "Yes" : "No"}</Badge></div>
                </div>

                <div className="col-span-3">
                  <Label>Is System</Label>
                  <div><Badge variant={currentCustomer.is_system ? "secondary" : "outline"}>{currentCustomer.is_system ? "Yes" : "No"}</Badge></div>
                </div>

                <div className="col-span-3">
                  <Label>Sort Order</Label>
                  <div className="text-sm">{currentCustomer.sort_order}</div>
                </div>
              </ERPFieldGrid>
            ) : (
              <div className="text-sm text-muted-foreground">Save customer first to view audit information</div>
            )}
          </ERPDrawerSection>
        </ERPDrawerBody>

        <ERPFormFooter
          mode={currentMode}
          onCancel={() => onOpenChange(false)}
          onSave={isViewing ? undefined : () => handleSave()}
          onSaveAndClose={isViewing ? undefined : () => handleSaveAndClose()}
          isSubmitting={isSubmitting}
          hasUnsavedChanges={isDirty}
        />
        
        <input type="hidden" name="sort_order" value={currentCustomer?.sort_order ?? 0} />
      </form>
    </ERPDrawerForm>
  );
}
