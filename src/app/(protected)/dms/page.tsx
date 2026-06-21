import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import Link from "next/link";
import { FileText, FolderOpen, FileType2, ListTree, Tag, Clock, ArrowRight, Layers } from "lucide-react";
import { ERPPageHeader } from "@/components/erp/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsDashboardPage() {
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "dms.documents.view") && !hasPermission(authContext, "dms.admin")) {
    redirect("/dashboard");
  }

  const quickLinks = [
    {
      href: "/dms/documents",
      label: "All Documents",
      description: "Browse and manage DMS documents",
      icon: FileText,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      href: "/dms/inbox/batches",
      label: "Batch Intake",
      description: "Review multi-file upload batches & AI drafts",
      icon: Layers,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      href: "/admin/dms/categories",
      label: "Document Categories",
      description: "Manage document categories",
      icon: FolderOpen,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
    },
    {
      href: "/admin/dms/document-types",
      label: "Document Types",
      description: "Manage document types",
      icon: FileType2,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      href: "/admin/dms/metadata-definitions",
      label: "Metadata Definitions",
      description: "Manage metadata fields",
      icon: ListTree,
      color: "text-teal-600",
      bg: "bg-teal-50",
    },
    {
      href: "/admin/dms/tags",
      label: "Tags",
      description: "Manage document tags",
      icon: Tag,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
    {
      href: "/admin/dms/retention-policies",
      label: "Retention Policies",
      description: "Manage retention policies",
      icon: Clock,
      color: "text-rose-600",
      bg: "bg-rose-50",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <ERPPageHeader
        title="Document Management System"
        description="Manage documents, metadata, tags, and retention policies"
        breadcrumbs={[{ label: "DMS" }]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-start gap-4 p-4 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/20 transition-all"
          >
            <div className={`p-2.5 rounded-lg ${link.bg}`}>
              <link.icon className={`h-5 w-5 ${link.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">{link.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{link.description}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all mt-1" />
          </Link>
        ))}
      </div>
    </div>
  );
}
