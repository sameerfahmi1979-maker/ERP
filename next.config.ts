import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
