import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, AlertTriangle, CheckSquare, UserMinus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HrActionsPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.actions.view")) {
    redirect("/admin");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">HR Actions</h1>
        <p className="text-muted-foreground mt-1">
          Manage PRO processes, disciplinary records, approval requests, and end-of-service cases across all employees.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/admin/hr/actions/pro">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-5 w-5 text-primary" />
                PRO Processes
              </CardTitle>
              <CardDescription>
                View and manage all employee PRO, government, visa, and legal admin processes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Visa renewals · Work permits · Government submissions</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/hr/actions/disciplinary">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-primary" />
                Disciplinary & Warnings
              </CardTitle>
              <CardDescription>
                View and manage all employee disciplinary records and warning notices.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Verbal warnings · Written warnings · Final warnings · Incidents</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/hr/actions/approvals">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckSquare className="h-5 w-5 text-primary" />
                Approval Requests
              </CardTitle>
              <CardDescription>
                View and process all pending HR approval requests across all employees.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Pending · Approved · Rejected · All types</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/hr/actions/eos">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserMinus className="h-5 w-5 text-primary" />
                EOS & Clearance
              </CardTitle>
              <CardDescription>
                View and manage all end-of-service cases and clearance checklists.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Resignations · Terminations · Clearance tracking</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Note:</strong> HR Actions, Performance Reviews, and HR Notes are managed
        from the individual employee profile (HR Actions tab). Financial settlement for EOS is handled by the Finance module.
      </div>
    </div>
  );
}
