import Link from "next/link";
import { ERPPageHeader } from "@/components/erp/page-header";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

export default async function SettingsPage() {
  const ctx = await getAuthContext();
  const destinations = [
    { href: "/profile", title: "Your profile and password", description: "Review your account details and change your password.", allowed: true },
    { href: "/admin/settings/branding", title: "Application branding", description: "Manage the application identity and brand assets.", allowed: hasPermission(ctx, "branding.app.view") || hasPermission(ctx, "reports.manage") },
    { href: "/admin/settings/numbering", title: "Record numbering", description: "Review numbering rules for business records.", allowed: hasPermission(ctx, "numbering.rules.view") },
  ].filter(item => item.allowed);
  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader title="Settings" description="Account and application settings available to you." breadcrumbs={[{ label: "Settings" }]} />
      <ul className="grid gap-4 md:grid-cols-2">{destinations.map(item => <li key={item.href}>
        <Link href={item.href} className="block rounded-sm border bg-card p-5 hover:border-primary focus-visible:outline-2">
          <h2 className="font-semibold text-primary">{item.title}</h2><p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
        </Link>
      </li>)}</ul>
    </div>
  );
}
