const { createHash } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { TextDecoder } = require('node:util');

// Match the checked-in Docker build inputs. Package lifecycle inputs are in
// this list even when they are only needed before Next starts compiling.
const directories = ['src', 'public'];
const files = [
  '.dockerignore', 'Dockerfile', 'next.config.ts', 'package.json', 'package-lock.json',
  'postcss.config.mjs', 'tsconfig.json', 'tsconfig.shipping.json', 'tooling/dms/validate-intake.cjs',
  'tooling/release/build-inputs.cjs', 'vendor/shadcn/tailwind.css',
  'vendor/braces-3.0.3-algt-integrated-2.tgz', 'vendor/sprintf-js-1.0.3-algt.1.tgz',
];
const publicConfiguration = [
  'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_DMS_BATCH_SERIAL', 'NEXT_PUBLIC_ERP_COMPANY_NAME',
  'NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED', 'NEXT_PUBLIC_ERP_SUPPORT_EMAIL', 'NEXT_PUBLIC_SIGNUP_ENABLED',
  'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL',
];
const textExtensions = /\.(?:cjs|mjs|tsx?|jsx?|json|css|svg|html?|txt|webmanifest|md)$/i;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function normalize(name, bytes) {
  if (!(textExtensions.test(name) || name === 'Dockerfile' || name === '.dockerignore')) return bytes;
  return Buffer.from(decoder.decode(bytes).replace(/\r\n/g, '\n'));
}

function collectReleaseInputs(root, env = process.env) {
  const paths = new Set(files);
  function walk(path) {
    for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
      const name = `${path}/${entry.name}`;
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) paths.add(name);
      else throw new Error(`Unsupported release build input: ${name}`);
    }
  }
  directories.forEach(walk);
  const inputs = [...paths].sort().map(name => {
    const bytes = readFileSync(join(root, name));
    return { name, sha256: sha(bytes), normalizedSha256: sha(normalize(name, bytes)) };
  });
  const publicConfig = publicConfiguration.map(name => [name, sha(JSON.stringify(env[name] ?? null))]);
  const sourceFingerprint = sha(JSON.stringify(inputs.map(({name, normalizedSha256}) => [name, normalizedSha256])));
  const buildId = sha(JSON.stringify([sourceFingerprint, publicConfig]));
  return { format: 1, sourceFingerprint, buildId, publicConfig: Object.fromEntries(publicConfig), inputs };
}

module.exports = { collectReleaseInputs };
if (require.main === module) console.log(JSON.stringify(collectReleaseInputs(process.cwd()), null, 2));
