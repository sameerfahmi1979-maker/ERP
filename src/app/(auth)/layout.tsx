import { loadRuntimeAppBranding } from "@/lib/branding/load-runtime-app-branding";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const branding = await loadRuntimeAppBranding();
  const loginBg = branding.assets.login_background?.publicUrl ?? null;

  return (
    <main className="algt-auth">
      <aside className="algt-auth-identity" aria-label={branding.appName}>
        {loginBg && <div className="algt-auth-image" style={{ backgroundImage: `url(${loginBg})` }} aria-hidden="true" />}
        <div className="algt-auth-brand">
          {branding.assets.app_logo?.publicUrl
            ? <Image src={branding.assets.app_logo.publicUrl} alt={branding.appName} width={180} height={64} unoptimized priority className="algt-auth-logo" />
            : <span className="algt-auth-monogram">{branding.initials}</span>}
          <p className="algt-auth-company">{branding.appName}</p>
          {branding.tagline && <p>{branding.tagline}</p>}
        </div>
        <p className="algt-auth-caption">Your work. One connected workspace.</p>
      </aside>
      <div className="algt-auth-task">{children}</div>
    </main>
  );
}
