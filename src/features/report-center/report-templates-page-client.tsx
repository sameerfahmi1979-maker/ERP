"use client";

/**
 * Report Templates & Branding Profiles Page — Client Component
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 */

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, FileText, Building2, CheckCircle2, XCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { ERPPageHeader } from "@/components/erp/page-header";
import { BrandingProfileForm } from "./branding-profile-form";
import { TemplateForm } from "./template-form";
import type { ReportBrandingProfile, ReportTemplate } from "@/lib/report-center/types";

const profileTypeColors: Record<string, "default" | "secondary" | "outline"> = {
  company: "default",
  group: "secondary",
  neutral: "outline",
  custom: "outline",
};

interface Props {
  initialProfiles: ReportBrandingProfile[];
  initialTemplates: ReportTemplate[];
  canManage: boolean;
}

export function ReportTemplatesPageClient({ initialProfiles, initialTemplates, canManage }: Props) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [templates, setTemplates] = useState(initialTemplates);

  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ReportBrandingProfile | null>(null);

  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);

  const handleProfileSaved = (profile: ReportBrandingProfile, isNew: boolean) => {
    setProfiles((prev) =>
      isNew ? [profile, ...prev] : prev.map((p) => (p.id === profile.id ? profile : p))
    );
    setProfileDrawerOpen(false);
    setEditingProfile(null);
  };

  const handleTemplateSaved = (template: ReportTemplate, isNew: boolean) => {
    setTemplates((prev) =>
      isNew ? [template, ...prev] : prev.map((t) => (t.id === template.id ? template : t))
    );
    setTemplateDrawerOpen(false);
    setEditingTemplate(null);
  };

  // ── Branding profile columns ───────────────────────────────────────────────
  const profileColumns: ColumnDef<ReportBrandingProfile>[] = [
    {
      id: "profile_code",
      accessorKey: "profile_code",
      header: "Profile Code",
      size: 160,
      cell: ({ row }) => (
        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded block truncate">
          {row.original.profile_code}
        </code>
      ),
      meta: { exportValue: (row) => row.profile_code },
    },
    {
      id: "profile_name",
      accessorKey: "profile_name",
      header: "Profile Name",
      size: 240,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{row.original.profile_name}</div>
          {(row.original.legal_name_en ?? row.original.trade_name_en) && (
            <p className="text-xs text-muted-foreground truncate">
              {row.original.legal_name_en ?? row.original.trade_name_en}
            </p>
          )}
        </div>
      ),
      meta: { exportValue: (row) => row.profile_name },
    },
    {
      id: "profile_type",
      accessorKey: "profile_type",
      header: "Type",
      size: 100,
      cell: ({ row }) => (
        <Badge
          variant={profileTypeColors[row.original.profile_type] ?? "outline"}
          className="text-[10px] font-semibold px-1.5 py-0.5 capitalize"
        >
          {row.original.profile_type}
        </Badge>
      ),
      meta: { exportValue: (row) => row.profile_type },
    },
    {
      id: "theme",
      header: "Theme",
      size: 150,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div
            className="h-4 w-4 rounded border shrink-0"
            style={{ backgroundColor: row.original.theme_primary_color }}
            title={`Primary: ${row.original.theme_primary_color}`}
          />
          <div
            className="h-4 w-4 rounded border shrink-0"
            style={{ backgroundColor: row.original.theme_header_bg_color }}
            title={`Header: ${row.original.theme_header_bg_color}`}
          />
          <span className="text-xs text-muted-foreground font-mono truncate">
            {row.original.theme_primary_color}
          </span>
        </div>
      ),
      meta: { exportValue: (row) => row.theme_primary_color },
    },
    {
      id: "is_active",
      accessorKey: "is_active",
      header: "Active",
      size: 80,
      cell: ({ row }) =>
        row.original.is_active ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <XCircle className="h-4 w-4 text-muted-foreground" />
        ),
      meta: { exportValue: (row) => (row.is_active ? "Yes" : "No") },
    },
    ...(canManage
      ? ([
          {
            id: "actions",
            header: "",
            size: 60,
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }) => (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { setEditingProfile(row.original); setProfileDrawerOpen(true); }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ),
            meta: { exportable: false },
          },
        ] as ColumnDef<ReportBrandingProfile>[])
      : []),
  ];

  // ── Report template columns ────────────────────────────────────────────────
  const templateColumns: ColumnDef<ReportTemplate>[] = [
    {
      id: "template_code",
      accessorKey: "template_code",
      header: "Template Code",
      size: 160,
      cell: ({ row }) => (
        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded block truncate">
          {row.original.template_code}
        </code>
      ),
      meta: { exportValue: (row) => row.template_code },
    },
    {
      id: "template_name",
      accessorKey: "template_name",
      header: "Template Name",
      size: 240,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{row.original.template_name}</div>
          <p className="text-xs text-muted-foreground truncate">
            {row.original.language_mode} · {row.original.page_size?.toUpperCase()}
          </p>
        </div>
      ),
      meta: { exportValue: (row) => row.template_name },
    },
    {
      id: "template_type",
      accessorKey: "template_type",
      header: "Type",
      size: 100,
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0.5 capitalize">
          {row.original.template_type}
        </Badge>
      ),
      meta: { exportValue: (row) => row.template_type },
    },
    {
      id: "default_orientation",
      accessorKey: "default_orientation",
      header: "Orientation",
      size: 110,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground capitalize">{row.original.default_orientation}</span>
      ),
      meta: { exportValue: (row) => row.default_orientation },
    },
    {
      id: "is_default",
      accessorKey: "is_default",
      header: "Default",
      size: 80,
      cell: ({ row }) =>
        row.original.is_default ? (
          <CheckCircle2 className="h-4 w-4 text-primary" />
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
      meta: { exportValue: (row) => (row.is_default ? "Yes" : "No") },
    },
    {
      id: "is_active",
      accessorKey: "is_active",
      header: "Active",
      size: 80,
      cell: ({ row }) =>
        row.original.is_active ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <XCircle className="h-4 w-4 text-muted-foreground" />
        ),
      meta: { exportValue: (row) => (row.is_active ? "Yes" : "No") },
    },
    ...(canManage
      ? ([
          {
            id: "actions",
            header: "",
            size: 60,
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }) => (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { setEditingTemplate(row.original); setTemplateDrawerOpen(true); }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ),
            meta: { exportable: false },
          },
        ] as ColumnDef<ReportTemplate>[])
      : []),
  ];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Templates &amp; Branding"
        description="Manage report branding profiles and output templates"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Report Center", href: "/admin/reports" },
          { label: "Templates & Branding" },
        ]}
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setEditingProfile(null); setProfileDrawerOpen(true); }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Profile
              </Button>
              <Button
                size="sm"
                onClick={() => { setEditingTemplate(null); setTemplateDrawerOpen(true); }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Template
              </Button>
            </div>
          ) : null
        }
      />

      <Tabs defaultValue="profiles">
        <TabsList>
          <TabsTrigger value="profiles" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Branding Profiles ({profiles.length})
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Report Templates ({templates.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profiles">
          <div className="rounded-md border border-border overflow-hidden">
            <ERPDataTable
              tableId="admin.reports.branding-profiles"
              columns={profileColumns}
              data={profiles}
              searchPlaceholder="Search profiles..."
              emptyMessage="No branding profiles found."
              enableSorting
              enableColumnResizing
              enableRowSelection={false}
              enableColumnVisibility
              enablePreferences
              enableGlobalFilter
              initialPageSize={25}
              pageSizeOptions={[10, 25, 50]}
            />
          </div>
        </TabsContent>

        <TabsContent value="templates">
          <div className="rounded-md border border-border overflow-hidden">
            <ERPDataTable
              tableId="admin.reports.templates"
              columns={templateColumns}
              data={templates}
              searchPlaceholder="Search templates..."
              emptyMessage="No report templates found."
              enableSorting
              enableColumnResizing
              enableRowSelection={false}
              enableColumnVisibility
              enablePreferences
              enableGlobalFilter
              initialPageSize={25}
              pageSizeOptions={[10, 25, 50]}
            />
          </div>
        </TabsContent>
      </Tabs>

      <BrandingProfileForm
        open={profileDrawerOpen}
        onOpenChange={setProfileDrawerOpen}
        profile={editingProfile}
        onSaved={handleProfileSaved}
      />

      <TemplateForm
        open={templateDrawerOpen}
        onOpenChange={setTemplateDrawerOpen}
        template={editingTemplate}
        profiles={profiles}
        onSaved={handleTemplateSaved}
      />
    </div>
  );
}
