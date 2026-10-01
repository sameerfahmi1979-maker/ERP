const path = require('node:path');
module.exports = {
  reactStrictMode: true,
  // The generated fixture reuses only this ERP project's installed dependencies.
  turbopack: { root: process.env.F05_REPO_ROOT || path.resolve(__dirname, '../../../..') },
};
