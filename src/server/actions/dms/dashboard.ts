"use server";
import {readDmsDashboard} from "@/server/reads/dms-dashboard";
export type {DmsDashboard as DmsDashboardStats,DmsDocumentsByDay,DmsByCategory,DmsAiPipelineSlice,DmsExpiryBucket,DmsInboxPendingRow,DmsExpiringRow,DmsRenewalRow} from "@/lib/reads/dms-dashboard-schema";
/** Compatibility entrypoint; the mounted dashboard uses the cancellable read
 * route. Every caller receives verified sections, never fake zero defaults. */
export async function getDmsDashboardStats(rangeDays:7|30|90=30){return readDmsDashboard({rangeDays});}
