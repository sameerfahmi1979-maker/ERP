import { SupplyPage } from "@/features/supply/supply-page";

export default async function Page({ searchParams }: { searchParams: Promise<{
  branch?: string; scope?: string | string[]; queueSearch?: string | string[]; queuePage?: string | string[]; receiptPage?: string | string[];
}> }) {
  const { branch, scope, queueSearch, queuePage, receiptPage } = await searchParams;
  return <SupplyPage kind="procurement" branch={branch} scope={scope} queueSearch={queueSearch} queuePage={queuePage} receiptPage={receiptPage} />;
}
