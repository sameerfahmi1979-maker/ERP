import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">The requested ERP route does not exist.</p>
      <Link href="/dashboard" className="text-primary underline">
        Back to dashboard
      </Link>
    </div>
  );
}
