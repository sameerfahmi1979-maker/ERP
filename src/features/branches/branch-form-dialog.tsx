"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { BranchWithCompany, OwnerCompany } from "@/types/database";
import { createBranch, updateBranch } from "@/server/actions/branches";
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
import { 
  Building2, 
  MapPin, 
  Contact, 
  Wrench, 
  ScrollText 
} from "lucide-react";

type BranchFormDialogProps = {
  branch?: BranchWithCompany | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies?: OwnerCompany[];
};

export function BranchFormDialog({
  branch,
  open,
  onOpenChange,
  companies = [],
}: BranchFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = Boolean(branch);

  const formId = "branch-drawer-form";

  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: formId,
    enabled: true,
  });

  // Geography select state (interim — maps to legacy text fields until Branch FK migration)
  const [countryId, setCountryId] = useState<number | null>(null);
  const [emirateId, setEmirateId] = useState<number | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [areaZoneId, setAreaZoneId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;

    async function initGeographyFromLegacy() {
      if (!branch) {
        setCountryId(null);
        setEmirateId(null);
        setCityId(null);
        setAreaZoneId(null);
        return;
      }

      const supabase = createClient();
      let resolvedCountryId: number | null = null;
      let resolvedEmirateId: number | null = null;
      let resolvedCityId: number | null = null;
      let resolvedAreaZoneId: number | null = null;

      if (branch.emirate) {
        const { data: emirates } = await supabase
          .from("emirates")
          .select("id, country_id, name_en, emirate_code")
          .eq("is_active", true);

        const emMatch = emirates?.find(
          (e) =>
            e.name_en.toLowerCase() === branch.emirate!.trim().toLowerCase() ||
            e.emirate_code.toLowerCase() === branch.emirate!.trim().toLowerCase()
        );
        if (emMatch) {
          resolvedEmirateId = emMatch.id;
          resolvedCountryId = emMatch.country_id;
        }
      }

      if (branch.city) {
        let cityQuery = supabase
          .from("cities")
          .select("id, emirate_id, country_id, name_en, city_code")
          .eq("is_active", true);
        if (resolvedEmirateId) {
          cityQuery = cityQuery.eq("emirate_id", resolvedEmirateId);
        }
        const { data: cities } = await cityQuery;
        const cityMatch = cities?.find(
          (c) =>
            c.name_en.toLowerCase() === branch.city!.trim().toLowerCase() ||
            c.city_code.toLowerCase() === branch.city!.trim().toLowerCase()
        );
        if (cityMatch) {
          resolvedCityId = cityMatch.id;
          if (!resolvedEmirateId) resolvedEmirateId = cityMatch.emirate_id;
          if (!resolvedCountryId) resolvedCountryId = cityMatch.country_id;
        }
      }

      if (branch.area) {
        let areaQuery = supabase
          .from("areas_zones")
          .select("id, city_id, name_en, area_code")
          .eq("is_active", true);
        if (resolvedCityId) {
          areaQuery = areaQuery.eq("city_id", resolvedCityId);
        }
        const { data: areas } = await areaQuery;
        const areaMatch = areas?.find(
          (a) =>
            a.name_en.toLowerCase() === branch.area!.trim().toLowerCase() ||
            a.area_code.toLowerCase() === branch.area!.trim().toLowerCase()
        );
        if (areaMatch) {
          resolvedAreaZoneId = areaMatch.id;
          if (!resolvedCityId) resolvedCityId = areaMatch.city_id;
        }
      }

      setCountryId(resolvedCountryId);
      setEmirateId(resolvedEmirateId);
      setCityId(resolvedCityId);
      setAreaZoneId(resolvedAreaZoneId);
    }

    initGeographyFromLegacy();
  }, [open, branch]);

  const handleCountryChange = (id: number | null) => {
    setCountryId(id);
    setEmirateId(null);
    setCityId(null);
    setAreaZoneId(null);
  };

  const handleEmirateChange = (id: number | null) => {
    setEmirateId(id);
    setCityId(null);
    setAreaZoneId(null);
  };

  const handleCityChange = (id: number | null) => {
    setCityId(id);
    setAreaZoneId(null);
  };

  async function resolveGeographyTextFields() {
    const supabase = createClient();
    let emirateText = branch?.emirate ?? null;
    let cityText = branch?.city ?? null;
    let areaText = branch?.area ?? null;

    if (emirateId) {
      const { data } = await supabase.from("emirates").select("name_en").eq("id", emirateId).maybeSingle();
      if (data) emirateText = data.name_en;
    } else if (!emirateId && branch?.emirate) {
      emirateText = branch.emirate;
    }

    if (cityId) {
      const { data } = await supabase.from("cities").select("name_en").eq("id", cityId).maybeSingle();
      if (data) cityText = data.name_en;
    } else if (!cityId && branch?.city) {
      cityText = branch.city;
    }

    if (areaZoneId) {
      const { data } = await supabase.from("areas_zones").select("name_en").eq("id", areaZoneId).maybeSingle();
      if (data) areaText = data.name_en;
    } else if (!areaZoneId && branch?.area) {
      areaText = branch.area;
    }

    return { emirateText, cityText, areaText };
  }

  const sections = [
    { id: "basic", label: "Basic Info", icon: Building2 },
    { id: "location", label: "Location", icon: MapPin },
    { id: "contact", label: "Contact Details", icon: Contact },
    { id: "operations", label: "Operations Flags", icon: Wrench },
    { id: "notes", label: "Internal Notes", icon: ScrollText },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);

    const form = document.getElementById(formId) as HTMLFormElement;
    const formData = new FormData(form);
    const { emirateText, cityText, areaText } = await resolveGeographyTextFields();
    
    const data = {
      // Basic Branch Details
      owner_company_id: parseInt(formData.get("owner_company_id") as string),
      // Only include branch_code for new branches (disabled field doesn't submit)
      ...(isEditing ? {} : { branch_code: formData.get("branch_code") as string }),
      branch_name_en: formData.get("branch_name_en") as string,
      branch_name_ar: (formData.get("branch_name_ar") as string) || null,
      status: (formData.get("status") as "active" | "inactive" | "suspended") || "active",
      
      // Phase 002D: Branch categorization
      branch_type: (formData.get("branch_type") as string) || null,
      is_main_branch: formData.get("is_main_branch") === "on",
      operating_status: (formData.get("operating_status") as "active" | "maintenance" | "suspended" | "closed") || "active",
      
      // Location — synced from geography master data selections
      emirate: emirateText,
      city: cityText,
      area: areaText,
      address_line_1: (formData.get("address_line_1") as string) || null,
      address_line_2: (formData.get("address_line_2") as string) || null,
      po_box: (formData.get("po_box") as string) || null,
      makani_number: (formData.get("makani_number") as string) || null,
      latitude: formData.get("latitude") ? Number(formData.get("latitude")) : null,
      longitude: formData.get("longitude") ? Number(formData.get("longitude")) : null,
      
      // Contact
      phone: (formData.get("phone") as string) || null,
      email: (formData.get("email") as string) || null,
      contact_person_name: (formData.get("contact_person_name") as string) || null,
      contact_phone: (formData.get("contact_phone") as string) || null,
      contact_email: (formData.get("contact_email") as string) || null,
      
      // Operational Flags
      has_workshop: formData.get("has_workshop") === "on",
      has_warehouse: formData.get("has_warehouse") === "on",
      has_yard: formData.get("has_yard") === "on",
      has_weighbridge: formData.get("has_weighbridge") === "on",
      
      // Notes
      notes: (formData.get("notes") as string) || null,
    };

    try {
      const result = isEditing && branch
        ? await updateBranch({ ...data, id: branch.id } as any)
        : await createBranch({ ...data, branch_code: formData.get("branch_code") as string });

      if (result.success) {
        toast.success(isEditing ? "Branch updated" : "Branch created");
        resetDirty();
        return true;
      } else {
        toast.error(result.error || "Failed to save branch");
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
      title={isEditing ? "Edit Branch Profile" : "Create Branch Profile"}
      subtitle={isEditing ? `Modify branch credentials for ${branch?.branch_name_en}` : "Register a new company physical office or operations yard"}
      mode={isEditing ? "edit" : "add"}
      recordNumber={branch?.branch_code}
      status={branch?.status}
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
            <ERPDrawerSection id="basic" activeId={activeSection} title="Basic Branch Details">
              <ERPFieldGrid>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="owner_company_id" className="text-muted-foreground text-xs" required>
                    Owner Organization
                  </RequiredLabel>
                  <select
                    id="owner_company_id"
                    name="owner_company_id"
                    defaultValue={branch?.owner_company_id}
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select organization...</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.legal_name_en} ({company.company_code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="branch_code" className="text-muted-foreground text-xs" required>
                    Branch Code
                  </RequiredLabel>
                  <Input
                    id="branch_code"
                    name="branch_code"
                    className="h-9 text-xs uppercase"
                    defaultValue={branch?.branch_code}
                    disabled={isEditing}
                    required
                    placeholder="e.g., AUH, DXB, SHJ, ICAD"
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Short location/facility code used across the ERP (e.g., AUH, DXB, SHJ, ICAD, MUSSAFAH)
                  </span>
                </div>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="branch_name_en" className="text-muted-foreground text-xs" required>
                    Branch Name (English)
                  </RequiredLabel>
                  <Input
                    id="branch_name_en"
                    name="branch_name_en"
                    className="h-9 text-xs"
                    defaultValue={branch?.branch_name_en}
                    required
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <RequiredLabel htmlFor="branch_name_ar" className="text-muted-foreground text-xs">
                    Branch Name (Arabic)
                  </RequiredLabel>
                  <Input
                    id="branch_name_ar"
                    name="branch_name_ar"
                    className="h-9 text-xs"
                    defaultValue={branch?.branch_name_ar ?? ""}
                  />
                </div>
                <div className="col-span-4 space-y-1.5">
                  <Label htmlFor="branch_type" className="text-muted-foreground text-xs">Branch Type</Label>
                  <select
                    id="branch_type"
                    name="branch_type"
                    defaultValue={branch?.branch_type ?? ""}
                    className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select Type</option>
                    <option value="Head Office">Head Office</option>
                    <option value="Branch Office">Branch Office</option>
                    <option value="Yard">Yard</option>
                    <option value="Workshop">Workshop</option>
                    <option value="Warehouse">Warehouse</option>
                    <option value="Camp">Camp</option>
                    <option value="Project Site">Project Site</option>
                    <option value="Weighbridge">Weighbridge</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="col-span-4 space-y-1.5">
                  <Label htmlFor="status" className="text-muted-foreground text-xs">Status</Label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={branch?.status || "active"}
                    className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div className="col-span-4 space-y-1.5">
                  <Label htmlFor="operating_status" className="text-muted-foreground text-xs">Operating Status</Label>
                  <select
                    id="operating_status"
                    name="operating_status"
                    defaultValue={branch?.operating_status || "active"}
                    className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="suspended">Suspended</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div className="col-span-12 flex items-center space-x-2 pt-4">
                  <Checkbox
                    id="is_main_branch"
                    name="is_main_branch"
                    defaultChecked={branch?.is_main_branch ?? false}
                    className="border-input bg-background text-foreground data-[state=checked]:bg-indigo-600 data-[state=checked]:text-white"
                  />
                  <Label htmlFor="is_main_branch" className="cursor-pointer text-muted-foreground text-xs font-normal">
                    Main Branch (Head Office)
                  </Label>
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 2: Location */}
            <ERPDrawerSection id="location" activeId={activeSection} title="Geographic Office Location">
              <ERPFieldGrid>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="country_id" className="text-muted-foreground text-xs">Country</Label>
                  <CountrySelect
                    value={countryId}
                    onValueChange={handleCountryChange}
                    placeholder="Select Country"
                    className="h-9 text-xs"
                  />
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
                  {branch?.emirate && !emirateId && (
                    <p className="text-[9px] text-amber-600">
                      {branch.emirate} (legacy)
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
                  {branch?.city && !cityId && (
                    <p className="text-[9px] text-amber-600">
                      {branch.city} (legacy)
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
                  {branch?.area && !areaZoneId && (
                    <p className="text-[9px] text-amber-600">
                      {branch.area} (legacy)
                    </p>
                  )}
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="po_box" className="text-muted-foreground text-xs">PO Box</Label>
                  <Input id="po_box" name="po_box" className="h-9 text-xs" defaultValue={branch?.po_box ?? ""} />
                </div>
                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="address_line_1" className="text-muted-foreground text-xs">Address Line 1</Label>
                  <Input
                    id="address_line_1"
                    name="address_line_1"
                    className="h-9 text-xs"
                    defaultValue={branch?.address_line_1 ?? ""}
                  />
                </div>
                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="address_line_2" className="text-muted-foreground text-xs">Address Line 2</Label>
                  <Input
                    id="address_line_2"
                    name="address_line_2"
                    className="h-9 text-xs"
                    defaultValue={branch?.address_line_2 ?? ""}
                  />
                </div>
                <div className="col-span-4 space-y-1.5">
                  <Label htmlFor="makani_number" className="text-muted-foreground text-xs">Makani Number</Label>
                  <Input
                    id="makani_number"
                    name="makani_number"
                    className="h-9 text-xs"
                    defaultValue={branch?.makani_number ?? ""}
                    placeholder="UAE Makani address"
                  />
                </div>
                <div className="col-span-4 space-y-1.5">
                  <Label htmlFor="latitude" className="text-muted-foreground text-xs">Latitude</Label>
                  <Input
                    type="number"
                    id="latitude"
                    name="latitude"
                    step="0.0000001"
                    min="-90"
                    max="90"
                    className="h-9 text-xs"
                    defaultValue={branch?.latitude ?? ""}
                    placeholder="25.276987"
                  />
                </div>
                <div className="col-span-4 space-y-1.5">
                  <Label htmlFor="longitude" className="text-muted-foreground text-xs">Longitude</Label>
                  <Input
                    type="number"
                    id="longitude"
                    name="longitude"
                    step="0.0000001"
                    min="-180"
                    max="180"
                    className="h-9 text-xs"
                    defaultValue={branch?.longitude ?? ""}
                    placeholder="55.296249"
                  />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 3: Contact */}
            <ERPDrawerSection id="contact" activeId={activeSection} title="Branch Contacts & Representative">
              <ERPFieldGrid>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="phone" className="text-muted-foreground text-xs">Branch Phone</Label>
                  <Input id="phone" name="phone" className="h-9 text-xs" defaultValue={branch?.phone ?? ""} />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="email" className="text-muted-foreground text-xs">Branch Email</Label>
                  <Input type="email" id="email" name="email" className="h-9 text-xs" defaultValue={branch?.email ?? ""} />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="contact_person_name" className="text-muted-foreground text-xs">Contact Person Name</Label>
                  <Input
                    id="contact_person_name"
                    name="contact_person_name"
                    className="h-9 text-xs"
                    defaultValue={branch?.contact_person_name ?? ""}
                  />
                </div>
                <div className="col-span-6 space-y-1.5">
                  <Label htmlFor="contact_phone" className="text-muted-foreground text-xs">Contact Person Phone</Label>
                  <Input
                    id="contact_phone"
                    name="contact_phone"
                    className="h-9 text-xs"
                    defaultValue={branch?.contact_phone ?? ""}
                  />
                </div>
                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="contact_email" className="text-muted-foreground text-xs">Contact Person Email</Label>
                  <Input
                    type="email"
                    id="contact_email"
                    name="contact_email"
                    className="h-9 text-xs"
                    defaultValue={branch?.contact_email ?? ""}
                  />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            {/* Section 4: Operational Flags */}
            <ERPDrawerSection id="operations" activeId={activeSection} title="Operational Capabilities">
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Select the operational units and features active at this physical branch:
                </p>
                <div className="flex flex-col space-y-3 pt-2">
                  <div className="flex items-center space-x-2.5">
                    <Checkbox
                      id="has_workshop"
                      name="has_workshop"
                      defaultChecked={branch?.has_workshop ?? false}
                      className="border-input bg-background text-foreground data-[state=checked]:bg-indigo-600 data-[state=checked]:text-white"
                    />
                    <Label htmlFor="has_workshop" className="cursor-pointer text-muted-foreground text-xs font-normal">
                      Has Workshop (Vehicle/Equipment Service Center)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2.5">
                    <Checkbox
                      id="has_warehouse"
                      name="has_warehouse"
                      defaultChecked={branch?.has_warehouse ?? false}
                      className="border-input bg-background text-foreground data-[state=checked]:bg-indigo-600 data-[state=checked]:text-white"
                    />
                    <Label htmlFor="has_warehouse" className="cursor-pointer text-muted-foreground text-xs font-normal">
                      Has Warehouse (Inventory Storage)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2.5">
                    <Checkbox
                      id="has_yard"
                      name="has_yard"
                      defaultChecked={branch?.has_yard ?? false}
                      className="border-input bg-background text-foreground data-[state=checked]:bg-indigo-600 data-[state=checked]:text-white"
                    />
                    <Label htmlFor="has_yard" className="cursor-pointer text-muted-foreground text-xs font-normal">
                      Has Yard (Vehicle/Equipment Parking & Staging)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2.5">
                    <Checkbox
                      id="has_weighbridge"
                      name="has_weighbridge"
                      defaultChecked={branch?.has_weighbridge ?? false}
                      className="border-input bg-background text-foreground data-[state=checked]:bg-indigo-600 data-[state=checked]:text-white"
                    />
                    <Label htmlFor="has_weighbridge" className="cursor-pointer text-muted-foreground text-xs font-normal">
                      Has Weighbridge (Cargo/Truck Scale)
                    </Label>
                  </div>
                </div>
              </div>
            </ERPDrawerSection>

            {/* Section 5: Notes */}
            <ERPDrawerSection id="notes" activeId={activeSection} title="Branch Internal Notes">
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes & Comments</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  className="text-xs"
                  defaultValue={branch?.notes ?? ""}
                  rows={8}
                  placeholder="Internal notes about this branch..."
                />
              </div>
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
