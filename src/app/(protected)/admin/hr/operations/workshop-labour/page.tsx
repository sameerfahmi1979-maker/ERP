import { WorkshopWorkReview } from "@/features/workshop/job-work-review";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ branch?: string; before?: string; through?: string; cutoff?: string; scope?: string | string[] }>;
}) {
  return <WorkshopWorkReview mode="hr" query={await searchParams} />;
}
