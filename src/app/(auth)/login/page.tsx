import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";
import { loadRuntimeAppBranding } from "@/lib/branding/load-runtime-app-branding";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const branding = await loadRuntimeAppBranding();

  return (
    <Suspense>
      <LoginForm branding={branding} />
    </Suspense>
  );
}
