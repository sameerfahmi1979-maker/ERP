import { createBrowserClient } from "@supabase/ssr";
import { withDocumentReadPolicy } from "./document-read-policy";

export function createClient() {
  return withDocumentReadPolicy(createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ));
}
