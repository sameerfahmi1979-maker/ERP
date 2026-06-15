import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getParties } from "@/server/actions/master-data/parties";
import { PartiesTable } from "@/features/master-data/parties/parties-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function PartiesContent() {
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "master_data.parties.view")) {
    redirect("/admin");
  }

  const result = await getParties();
  const parties = result.success && result.data ? result.data : [];

  return <PartiesTable parties={parties} authContext={authContext} />;
}

export default async function PartiesPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Party Master</CardTitle>
          <CardDescription>
            Unified master registry for customers, vendors, subcontractors, government authorities, and all other business parties.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
            <PartiesContent />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
