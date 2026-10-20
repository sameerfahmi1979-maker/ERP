import{z}from'zod';
import{employeeId}from'./employee-contract';
export const siteReadinessValues=z.object({work_site_id:employeeId,fingerprint:z.string().regex(/^[0-9a-f]{64}$/)}).strict();
export const siteReadinessNotes=z.object({notes:z.string().max(5000).nullable()}).strict();
