import { Big_Shoulders, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

/**
 * Auth route group typography — scoped to (auth) only, does not affect the
 * global app font (Inter, set in src/app/layout.tsx for the ERP admin app).
 *
 * Big Shoulders: condensed industrial display face (Chicago rail/steel
 * signage heritage) — used sparingly, at heavy weight, for headlines,
 * echoing the transport & construction subject matter without leaning on
 * a generic serif/sans default.
 * IBM Plex Sans: engineering-heritage body face, highly legible.
 * IBM Plex Mono: utility face for eyebrow labels / system captions.
 */
export const displayFont = Big_Shoulders({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
  variable: "--font-auth-display",
});

export const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-auth-body",
});

export const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-auth-mono",
});

export const authFontVariables = `${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`;
