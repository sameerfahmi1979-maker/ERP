import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, ShieldCheck, AlertOctagon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HrOperationsPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    redirect("/access-denied");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">HR Operations</h1>
        <p className="text-muted-foreground mt-1">
          Manage employee assignments, site readiness, and operational blocks.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/admin/hr/operations/assignments">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-5 w-5 text-primary" />
                Employee Assignments
              </CardTitle>
              <CardDescription>
                View and manage all employee operational assignments by site, department, and designation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Active assignments Â· Assignment history Â· Reporting lines</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/hr/operations/readiness">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Readiness Monitor
              </CardTitle>
              <CardDescription>
                Monitor employee site readiness status across all work sites.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Readiness status Â· Missing requirements Â· Site coverage</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/hr/operations/blocks">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertOctagon className="h-5 w-5 text-primary" />
                Operational Blocks
              </CardTitle>
              <CardDescription>
                View and manage all active operational blocks preventing site assignment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Active blocks Â· Block types Â· Release history</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Note:</strong> Assets, PPE, and accommodation records are managed from the
        individual employee profile (Operations tab).
      </div>
    </div>
  );
}

