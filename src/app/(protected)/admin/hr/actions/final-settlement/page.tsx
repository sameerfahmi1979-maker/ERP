import { ExitSettlementWorkspace } from "@/features/hr/exit-settlement/exit-settlement-workspace";
import type { ExitSearchParams } from "@/features/hr/exit-settlement/exit-settlement-contract";

export const dynamic = "force-dynamic";

export default async function FinalSettlementPage({ searchParams }: { searchParams: Promise<ExitSearchParams> }) {
  return <ExitSettlementWorkspace params={await searchParams} />;
}

