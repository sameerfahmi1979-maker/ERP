import { createClient } from "@/lib/supabase/server";
import type { Permission } from "@/types/database";

export async function listPermissions(): Promise<Permission[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permissions")
    .select("*")
    .order("module_code", { ascending: true });

  if (error) {
    console.error("listPermissions error", error.message);
    return [];
  }

  return (data ?? []) as Permission[];
}
