import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppProviders } from "@/components/layout/app-providers";
import { AppBrandingThemeStyle } from "@/components/branding/app-branding-theme-style";
import { loadRuntimeAppBranding } from "@/lib/branding/load-runtime-app-branding";
import "./globals.css";

export const dynamic = "force-dynamic";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export async function generateMetadata(): Promise<Metadata> {
  const branding = await loadRuntimeAppBranding();
  const faviconAsset = branding.assets.favicon;

  return {
    title: {
      default: branding.appName,
      template: `%s | ${branding.appName}`,
    },
    description:
      branding.tagline ??
      "Enterprise ERP foundation with Supabase, Next.js, and shadcn/ui",
    icons: faviconAsset
      ? {
          icon: faviconAsset.publicUrl,
          shortcut: faviconAsset.publicUrl,
        }
      : undefined,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const branding = await loadRuntimeAppBranding();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <AppBrandingThemeStyle branding={branding} />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
