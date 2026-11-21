import { SupplyPage } from "@/features/supply/supply-page";

export default async function Page({ searchParams }: { searchParams: Promise<{
  branch?: string; scope?: string | string[]; queueSearch?: string | string[]; queuePage?: string | string[];
}> }) {
  const { branch, scope, queueSearch, queuePage } = await searchParams;
  return <SupplyPage kind="inventory" branch={branch} scope={scope} queueSearch={queueSearch} queuePage={queuePage} />;
}
