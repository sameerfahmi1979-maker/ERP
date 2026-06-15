import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/database";

export async function listRoles(): Promise<Role[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("listRoles error", error.message);
    return [];
  }

  return (data ?? []) as Role[];
}
