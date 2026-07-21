"use client";

import Link from "next/link";
import {
  FolderOpen,
  FileType2,
  ListTree,
  Tag,
  Clock,
  Database,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Brain,
} from "lucide-react";
import type { DmsAdminOverviewStats } from "@/server/actions/dms/overview";
import { DmsStandardFileNameBulkRenamePanel } from "@/features/dms/admin/dms-standard-file-name-bulk-rename-panel";

type Props = {
  stats: DmsAdminOverviewStats;
};

type StatCard = {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ElementType;
  href: string;
  color: string;
};

export function DmsOverviewClient({ stats }: Props) {
  const cards: StatCard[] = [
    {
      title: "Document Categories",
      value: stats.categories_total,
      subtitle: `${stats.categories_active} active`,
      icon: FolderOpen,
      href: "/admin/dms/categories",
      color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
    },
    {
      title: "Document Types",
      value: stats.document_types_total,
      subtitle: `${stats.document_types_active} active`,
      icon: FileType2,
      href: "/admin/dms/document-types",
      color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30",
    },
    {
      title: "System Types",
      value: stats.document_types_system,
      subtitle: `${stats.document_types_custom} custom`,
      icon: Database,
      href: "/admin/dms/document-types",
      color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30",
    },
    {
      title: "Metadata Fields",
      value: stats.metadata_definitions_total,
      subtitle: "across all types",
      icon: ListTree,
      href: "/admin/dms/metadata-definitions",
      color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
    },
    {
      title: "Tags",
      value: stats.tags_total,
      subtitle: `${stats.tags_active} active`,
      icon: Tag,
      href: "/admin/dms/tags",
      color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
    },
    {
      title: "Retention Policies",
      value: stats.retention_policies_total,
      subtitle: `${stats.retention_policies_active} active`,
      icon: Clock,
      href: "/admin/dms/retention-policies",
      color: "text-rose-600 bg-rose-50 dark:bg-rose-950/30",
    },
    {
      title: "Approval Workflows",
      value: 0,
      subtitle: "Configure approval steps",
      icon: CheckCircle2,
      href: "/admin/dms/approval-workflows",
      color: "text-teal-600 bg-teal-50 dark:bg-teal-950/30",
    },
  ];

  return (
    <div className="space-y-6">

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href + card.title}
              href={card.href}
              className="group relative rounded-lg border border-border/50 bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`p-2 rounded-md ${card.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-0.5" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-foreground">{card.value.toLocaleString()}</div>
                <div className="text-xs font-medium text-foreground mt-0.5">{card.title}</div>
                {card.subtitle && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">{card.subtitle}</div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <DmsStandardFileNameBulkRenamePanel />

      {/* Quick Links */}
      <div className="rounded-lg border border-border/50 bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Quick Management</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            { href: "/admin/dms/categories", label: "Manage Categories", icon: FolderOpen },
            { href: "/admin/dms/document-types", label: "Manage Document Types", icon: FileType2 },
            { href: "/admin/dms/metadata-definitions", label: "Manage Metadata Fields", icon: ListTree },
            { href: "/admin/dms/tags", label: "Manage Tags", icon: Tag },
            { href: "/admin/dms/retention-policies", label: "Manage Retention Policies", icon: Clock },
            { href: "/admin/dms/intelligence", label: "AI Intelligence Admin", icon: Brain },
          ].map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 p-2.5 rounded-md border border-border/40 hover:border-primary/40 hover:bg-muted/30 text-xs font-medium text-foreground transition-all group"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
