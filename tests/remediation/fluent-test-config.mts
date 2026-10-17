import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';

// Use the installed Fluent dependency's published browser/ESM entry. Inlining
// its CJS main alone still calls native require('keyborg'), creating a second
// runtime alongside Fluent's ESM import and colliding the window instance IDs.
// This changes test resolution only; no dependency is mocked or error hidden.
const require=createRequire(import.meta.url);
const fluentRequire=createRequire(require.resolve('@fluentui/react-tabster/package.json'));
const manifestPath=fluentRequire.resolve('tabster/package.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {module:string};
export const fluentTestAliases={tabster:path.resolve(path.dirname(manifestPath),manifest.module)};
export const fluentTestServer = {
  deps: { inline: [/[\\/]@fluentui[\\/]/, /[\\/]tabster[\\/]/, /[\\/]keyborg[\\/]/] },
};
