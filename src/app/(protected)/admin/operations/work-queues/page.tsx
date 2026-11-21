import { WorkQueueWorkspace } from "@/features/operations/work-queues/work-queue-workspace";

export const dynamic = "force-dynamic";

export default async function WorkQueuesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <WorkQueueWorkspace params={await searchParams} />;
}
