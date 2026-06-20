"use client";

/**
 * Report Templates & Branding Profiles Page — Client Component
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Shows two tabs: Branding Profiles and Report Templates.
 * Edit/create via inline drawer forms.
 */

import { useState } from "react";
import { Plus, Palette, FileText, Building2, CheckCircle2, XCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandingProfileForm } from "./branding-profile-form";
import { TemplateForm } from "./template-form";
import type { ReportBrandingProfile, ReportTemplate } from "@/lib/report-center/types";

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  initialProfiles: ReportBrandingProfile[];
  initialTemplates: ReportTemplate[];
  canManage: boolean;
}

const profileTypeColors: Record<string, "default" | "secondary" | "outline"> = {
  company: "default",
  group: "secondary",
  neutral: "outline",
  custom: "outline",
};

export function ReportTemplatesPageClient({ initialProfiles, initialTemplates, canManage }: Props) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [templates, setTemplates] = useState(initialTemplates);

  // Profile drawer state
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ReportBrandingProfile | null>(null);

  // Template drawer state
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

  return (
    <div className="flex flex-col gap-6 p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Palette className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Templates &amp; Branding</h1>
      </div>

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

        {/* ── Branding Profiles tab ────────────────────────────────────────── */}
        <TabsContent value="profiles">
          <div className="flex justify-end mb-3">
            {canManage && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingProfile(null);
                  setProfileDrawerOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Profile
              </Button>
            )}
          </div>

          <div className="rounded-lg border shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[200px]">Profile Code</TableHead>
                  <TableHead>Profile Name</TableHead>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead className="w-[180px]">Theme</TableHead>
                  <TableHead className="w-[80px]">Active</TableHead>
                  {canManage && <TableHead className="w-[60px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManage ? 6 : 5} className="text-center py-10 text-muted-foreground text-sm">
                      No branding profiles found.
                    </TableCell>
                  </TableRow>
                ) : (
                  profiles.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell>
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                          {p.profile_code}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{p.profile_name}</div>
                        {(p.legal_name_en ?? p.trade_name_en) && (
                          <p className="text-xs text-muted-foreground">{p.legal_name_en ?? p.trade_name_en}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={profileTypeColors[p.profile_type] ?? "outline"} className="text-xs">
                          {p.profile_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-4 w-4 rounded border"
                            style={{ backgroundColor: p.theme_primary_color }}
                            title={`Primary: ${p.theme_primary_color}`}
                          />
                          <div
                            className="h-4 w-4 rounded border"
                            style={{ backgroundColor: p.theme_header_bg_color }}
                            title={`Header: ${p.theme_header_bg_color}`}
                          />
                          <span className="text-xs text-muted-foreground font-mono">{p.theme_primary_color}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.is_active ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingProfile(p);
                              setProfileDrawerOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Templates tab ─────────────────────────────────────────────────── */}
        <TabsContent value="templates">
          <div className="flex justify-end mb-3">
            {canManage && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingTemplate(null);
                  setTemplateDrawerOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Template
              </Button>
            )}
          </div>

          <div className="rounded-lg border shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[200px]">Template Code</TableHead>
                  <TableHead>Template Name</TableHead>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead className="w-[120px]">Orientation</TableHead>
                  <TableHead className="w-[80px]">Default</TableHead>
                  <TableHead className="w-[80px]">Active</TableHead>
                  {canManage && <TableHead className="w-[60px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManage ? 7 : 6} className="text-center py-10 text-muted-foreground text-sm">
                      No report templates found.
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map((t) => (
                    <TableRow key={t.id} className="hover:bg-muted/30">
                      <TableCell>
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                          {t.template_code}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{t.template_name}</div>
                        <p className="text-xs text-muted-foreground">{t.language_mode} · {t.page_size?.toUpperCase()}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {t.template_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">
                        {t.default_orientation}
                      </TableCell>
                      <TableCell>
                        {t.is_default ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.is_active ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingTemplate(t);
                              setTemplateDrawerOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Branding Profile drawer */}
      <BrandingProfileForm
        open={profileDrawerOpen}
        onOpenChange={setProfileDrawerOpen}
        profile={editingProfile}
        onSaved={handleProfileSaved}
      />

      {/* Template drawer */}
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
