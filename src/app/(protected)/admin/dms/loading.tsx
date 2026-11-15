import { DmsLoadingStatus } from "@/features/dms/dms-loading-status";

export default function Loading() {
  return <DmsLoadingStatus label="Loading document management…" className="min-h-32 p-6" />;
}
