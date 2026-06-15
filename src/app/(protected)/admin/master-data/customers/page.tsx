import { redirect } from "next/navigation";

export default function LegacyCustomersPage() {
  redirect("/admin/master-data/parties/customers");
}
