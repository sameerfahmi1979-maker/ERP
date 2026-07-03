import { loadRuntimeAppBranding } from "@/lib/branding/load-runtime-app-branding";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const branding = await loadRuntimeAppBranding();
  const loginBg = branding.assets.login_background?.publicUrl ?? null;

  return (
    <div className="relative flex h-screen w-screen overflow-hidden items-center justify-center p-4">
      {/* Background layer — fixed to viewport so it always fills the screen exactly */}
      {loginBg ? (
        <div
          className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${loginBg})` }}
          aria-hidden
        />
      ) : (
        <div className="fixed inset-0 -z-10 bg-muted/30" aria-hidden />
      )}
      {/* Overlay for readability */}
      {loginBg ? (
        <div className="fixed inset-0 -z-10 bg-background/60 backdrop-blur-[2px]" aria-hidden />
      ) : null}
      <div className="relative z-10 w-full flex justify-center">{children}</div>
    </div>
  );
}
