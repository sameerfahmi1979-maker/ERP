"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function signOut() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return { success: false, error: "Sign out could not be confirmed. Please retry." };
    revalidatePath("/", "layout");
    return { success: true };
  } catch {
    return { success: false, error: "Sign out is temporarily unavailable. Please retry." };
  }
}
