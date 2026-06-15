import { redirect } from "next/navigation";

export default function LegacyCustomerRecordPage() {
  redirect("/admin/master-data/parties/customers");
}
