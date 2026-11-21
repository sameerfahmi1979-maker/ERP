import { PayslipWorkspace } from "@/features/hr/payroll-payslips/payslip-workspace";

export default async function PayslipsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PayslipWorkspace params={await searchParams} />;
}
