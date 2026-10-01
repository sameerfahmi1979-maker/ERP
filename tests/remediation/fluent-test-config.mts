// Tabster 8.8.0 has a legacy CommonJS main whose named exports require bundler
// interop. Transform the real dependencies through Vite as browser builds do.
// No dependency is mocked and no lifecycle/error assertion is suppressed.
export const fluentTestServer = {
  deps: { inline: [/[\\/]@fluentui[\\/]/, /[\\/]tabster[\\/]/] },
};
