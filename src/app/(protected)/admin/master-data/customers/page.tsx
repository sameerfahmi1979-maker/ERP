import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getCustomers } from "@/server/actions/master-data/customers";
import { CustomersTable } from "@/features/master-data/customers/components/customers-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function CustomersContent() {
  const authContext = await getAuthContext();
  
  if (!hasPermission(authContext, "master_data.party_master.view")) {
    redirect("/admin");
  }

  const result = await getCustomers();
  const customers = result.success && result.data ? result.data : [];

  return <CustomersTable customers={customers} authContext={authContext} />;
}

export default async function CustomersPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <CardDescription>
            Manage customer master data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
            <CustomersContent />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
