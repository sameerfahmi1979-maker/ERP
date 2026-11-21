import { WorkshopWorkReview } from "@/features/workshop/job-work-review";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ branch?: string; before?: string; through?: string; cutoff?: string }>;
}) {
  return <WorkshopWorkReview mode="accounts" query={await searchParams} />;
}
