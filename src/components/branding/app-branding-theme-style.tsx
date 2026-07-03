import type { RuntimeAppBranding } from "@/lib/branding/runtime-types";

type AppBrandingThemeStyleProps = {
  branding: RuntimeAppBranding;
};

/**
 * Injects optional CSS variables from app branding theme colors.
 * Safe no-op when colors are not configured.
 */
export function AppBrandingThemeStyle({ branding }: AppBrandingThemeStyleProps) {
  const { themePrimaryColor, themeSecondaryColor, themeAccentColor } = branding;

  if (!themePrimaryColor && !themeSecondaryColor && !themeAccentColor) {
    return null;
  }

  const css = `:root {
${themePrimaryColor ? `  --branding-primary: ${themePrimaryColor};` : ""}
${themeSecondaryColor ? `  --branding-secondary: ${themeSecondaryColor};` : ""}
${themeAccentColor ? `  --branding-accent: ${themeAccentColor};` : ""}
}`;

  return <style id="erp-app-branding-theme">{css}</style>;
}
