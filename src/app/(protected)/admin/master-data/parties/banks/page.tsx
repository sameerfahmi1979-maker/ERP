import { redirect } from "next/navigation";

/**
 * ERP BANK MASTER STANDARD.1
 * Banks are managed in Finance Basics, not Party Master.
 * This route is retired — redirect to the canonical Finance Banks route.
 */
export default function PartyBanksRetiredPage() {
  redirect("/admin/master-data/finance-basics/banks");
}
