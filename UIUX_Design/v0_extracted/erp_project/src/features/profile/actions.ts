"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type UpdateMyProfileInput = {
  displayName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
};

export async function updateMyProfile(input: UpdateMyProfileInput) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_my_profile", {
    p_display_name: input.displayName ?? null,
    p_phone: input.phone ?? null,
    p_avatar_url: input.avatarUrl ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/profile");
}
