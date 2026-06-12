import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getPaymentTerms } from "@/features/master-data/finance-basics/actions";
import { ERPPageHeader } from "@/components/erp/page-header";
import { PaymentTermsTable } from "@/features/master-data/finance-basics/components/payment-terms-table";

export const metadata = {
  title: "Payment Terms | Finance Basics | Master Data | ERP",
  description: "Manage commercial payment terms including due days, advance and retention percentages",
};

async function PaymentTermsContent({ authContext }: { authContext: AuthContext }) {
  const result = await getPaymentTerms();

  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load payment terms</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <PaymentTermsTable paymentTerms={result.data} authContext={authContext} />;
}

export default async function PaymentTermsPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "master_data.finance_basics.view")) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Payment Terms"
        description="Manage commercial payment terms with due days, advance and retention percentages"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Finance Basics", href: "/admin/master-data/finance-basics/currencies" },
          { label: "Payment Terms", href: "/admin/master-data/finance-basics/payment-terms" },
        ]}
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        }
      >
        <PaymentTermsContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
