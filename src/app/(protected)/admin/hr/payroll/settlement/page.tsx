import { PayrollSettlementWorkspace } from "@/features/hr/payroll-settlement/payroll-settlement-workspace";

export default async function PayrollSettlementPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PayrollSettlementWorkspace params={await searchParams} />;
}

