import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listLookupCategories, listLookupValues } from "@/server/actions/master-data/lookups";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata = {
  title: "Locked System Values | Master Data | ERP",
  description: "View system-locked lookup values",
};

async function LockedSystemContent() {
  const [categoriesResult, valuesResult] = await Promise.all([
    listLookupCategories({ is_system: true, is_locked: true }),
    listLookupValues({ is_locked: true }),
  ]);
  
  if (!categoriesResult.success || !categoriesResult.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load locked categories</p>
        <p className="text-sm text-destructive mt-2">{categoriesResult.error}</p>
      </div>
    );
  }

  if (!valuesResult.success || !valuesResult.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load locked values</p>
        <p className="text-sm text-destructive mt-2">{valuesResult.error}</p>
      </div>
    );
  }

  const lockedCategories = categoriesResult.data;
  const lockedValues = valuesResult.data;

  return (
    <div className="space-y-6">
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>System-Locked Values</AlertTitle>
        <AlertDescription>
          These values are critical to the ERP system and are locked to prevent accidental modification.
          Only users with lock permission can modify these values.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Locked Categories ({lockedCategories.length})
          </CardTitle>
          <CardDescription>System-managed category definitions</CardDescription>
        </CardHeader>
        <CardContent>
          {lockedCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No locked categories</p>
          ) : (
            <div className="space-y-2">
              {lockedCategories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <p className="font-medium">{cat.category_name_en}</p>
                    <p className="text-sm text-muted-foreground">{cat.category_code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {cat.is_system && <Badge variant="secondary">System</Badge>}
                    {cat.is_locked && <Badge variant="outline"><Lock className="h-3 w-3 mr-1" />Locked</Badge>}
                    {cat.is_active ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Locked Values ({lockedValues.length})
          </CardTitle>
          <CardDescription>System-managed lookup values</CardDescription>
        </CardHeader>
        <CardContent>
          {lockedValues.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No locked values</p>
          ) : (
            <div className="space-y-2">
              {lockedValues.map((val) => (
                <div key={val.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-3">
                    {val.color_hex && (
                      <span
                        className="inline-block w-4 h-4 rounded-full border"
                        style={{ backgroundColor: val.color_hex }}
                      />
                    )}
                    <div>
                      <p className="font-medium">{val.value_label_en}</p>
                      <p className="text-sm text-muted-foreground">
                        {val.category?.category_name_en || 'Unknown'} : {val.value_code}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {val.is_system && <Badge variant="secondary">System</Badge>}
                    {val.is_locked && <Badge variant="outline"><Lock className="h-3 w-3 mr-1" />Locked</Badge>}
                    {val.is_default && <Badge variant="default">Default</Badge>}
                    {val.is_active ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
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

export default async function LockedSystemValuesPage() {
  const ctx = await getAuthContext();
  
  if (!hasPermission(ctx, "master_data.lookups.view")) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Locked System Values"
        description="View and manage system-critical locked lookup values"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Locked System Values", href: "/admin/master-data/lookups/system" },
        ]}
      />
      
      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }>
        <LockedSystemContent />
      </Suspense>
    </div>
  );
}
