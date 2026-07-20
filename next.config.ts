import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Branding/DMS uploads use Server Actions with FormData; default 1 MB is too small.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
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
