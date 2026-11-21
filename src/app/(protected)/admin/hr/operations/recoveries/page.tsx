
import { RecoveryWorkspace } from "@/features/hr/recoveries/recovery-workspace";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ branch?: string; month?: string; case?: string; before?: string }>;
}) {
  return <RecoveryWorkspace query={await searchParams} />;
}
