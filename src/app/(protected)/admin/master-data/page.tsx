import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getLookupDashboardStats } from "@/server/actions/master-data/lookups";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, FolderTree, Lock, Activity, Clock } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Master Data Dashboard | ERP",
  description: "Master data management dashboard",
};

async function DashboardContent() {
  const ctx = await getAuthContext();
  
  if (!hasPermission(ctx, "master_data.dashboard.view")) {
    redirect("/access-denied");
  }

  const result = await getLookupDashboardStats();
  
  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load dashboard statistics</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  const stats = result.data;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Categories</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_categories}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600">{stats.active_categories} active</span>
              {" • "}
              <span className="text-gray-500">{stats.inactive_categories} inactive</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Values</CardTitle>
            <FolderTree className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_values}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600">{stats.active_values} active</span>
              {" • "}
              <span className="text-gray-500">{stats.inactive_values} inactive</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Locked System Values</CardTitle>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.locked_values}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Critical system-managed values
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round((stats.active_values / stats.total_values) * 100) || 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Value activation rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
          <CardDescription>Navigate to master data management sections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Link
              href="/admin/master-data/lookups/categories"
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-accent transition-colors"
            >
              <Database className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Lookup Categories</p>
                <p className="text-xs text-muted-foreground">Manage category definitions</p>
              </div>
            </Link>

            <Link
              href="/admin/master-data/lookups/values"
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-accent transition-colors"
            >
              <FolderTree className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Lookup Values</p>
                <p className="text-xs text-muted-foreground">Manage dropdown values</p>
              </div>
            </Link>

            <Link
              href="/admin/master-data/lookups/system"
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-accent transition-colors"
            >
              <Lock className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Locked System Values</p>
                <p className="text-xs text-muted-foreground">View critical system values</p>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recently Updated */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recently Updated Values
          </CardTitle>
          <CardDescription>Latest changes to lookup values</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recently_updated.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No recent updates
            </p>
          ) : (
            <div className="space-y-2">
              {stats.recently_updated.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <p className="text-sm font-medium">{item.value_label}</p>
                    <p className="text-xs text-muted-foreground">{item.category_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.updated_at).toLocaleDateString()}
                    </p>
                    {item.updated_by_name && (
                      <p className="text-xs text-muted-foreground">{item.updated_by_name}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MasterDataDashboardPage() {
  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Master Data Dashboard"
        description="Overview of master data categories and lookup values"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
        ]}
      />
      
      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
