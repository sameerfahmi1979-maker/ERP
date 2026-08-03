import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nested package.json files (e.g. under spikes/) confuse Turbopack's
  // workspace-root inference and crash the dev server with "Next.js package
  // not found". Pin the root explicitly to this repository.
  turbopack: {
    root: __dirname,
  },
  // Branding/DMS uploads use Server Actions with FormData; default 1 MB is too small.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // WORKSPACE.PERF.1 (WS.2, decision D2): re-enable the client router cache
    // for dynamic pages (Next 15 changed the default to 0s). Returning to a
    // workspace tab visited < 30s ago reuses the cached RSC payload — instant,
    // zero server work. Saves still see fresh data: server actions calling
    // revalidatePath/router.refresh() bypass this cache.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  // Supabase Edge Functions (Deno runtime) live in supabase/functions/ and use
  // Deno-specific imports (https://esm.sh/..., Deno.serve, etc.) that are
  // incompatible with the Next.js TypeScript checker. The functions directory
  // is already excluded from tsconfig.json; this flag prevents Next.js from
  // failing the build if Turbopack's checker still traverses those files.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Native-binary server packages must not be bundled by Turbopack/Webpack.
  // @napi-rs/canvas ships pre-built .node files; pdf-parse and sharp also
  // use native bindings. Marking them external lets Node.js load them at
  // runtime without attempting to statically bundle the binary assets.
  serverExternalPackages: [
    "@napi-rs/canvas",
    "pdf-parse",
    "sharp",
    "mammoth",
    "xlsx",
  ],
};

export default nextConfig;
