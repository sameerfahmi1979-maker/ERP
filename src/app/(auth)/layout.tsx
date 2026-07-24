import { loadRuntimeAppBranding } from "@/lib/branding/load-runtime-app-branding";
import { AuthAtmosphere } from "@/features/auth/auth-atmosphere";
import { authFontVariables } from "./fonts";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const branding = await loadRuntimeAppBranding();
  const loginBg = branding.assets.login_background?.publicUrl ?? null;

  return (
    <div
      className={`dark ${authFontVariables} relative flex h-screen w-screen overflow-hidden items-center justify-center p-4 [font-family:var(--font-auth-body)]`}
    >
      {/* Background layer — fixed to viewport so it always fills the screen exactly.
          Admin-uploaded login background (if set) always wins over the signature
          atmosphere backdrop below. */}
      {loginBg ? (
        <>
          <div
            className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${loginBg})` }}
            aria-hidden
          />
          <div className="fixed inset-0 -z-10 bg-[#070c14]/70 backdrop-blur-[2px]" aria-hidden />
        </>
      ) : (
        <AuthAtmosphere />
      )}
      <div className="relative z-10 w-full flex justify-center">{children}</div>
    </div>
  );
}
