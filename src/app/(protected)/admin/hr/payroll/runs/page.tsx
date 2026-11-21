import { PayrollRunWorkspace } from "@/features/hr/payroll-runs/payroll-workspace";

export default async function PayrollRunsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PayrollRunWorkspace params={await searchParams} />;
}
