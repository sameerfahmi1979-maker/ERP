import { ShieldX, ArrowLeft } from "lucide-react";

/**
 * ERP USERS.4 — Access Denied page.
 * Shown when a user tries to navigate to a route they don't have permission for.
 * Lives inside (protected) layout so the ERP shell renders (the user can navigate away).
 */
export default function AccessDeniedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
      <div className="flex items-center justify-center h-16 w-16 rounded-full bg-destructive/10">
        <ShieldX className="h-8 w-8 text-destructive" />
      </div>

      <div className="space-y-2 max-w-md">
        <h1 className="text-2xl font-bold tracking-tight">Access Denied</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          You don&apos;t have permission to access this page. If you believe
          this is a mistake, please contact your system administrator.
        </p>
      </div>

      <a
        href="/dashboard"
        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </a>
    </div>
  );
}
