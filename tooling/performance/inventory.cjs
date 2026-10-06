// Retain the documented CommonJS command entry; the implementation uses ESM.
import('./inventory.mjs').catch(error => {
  console.error(error instanceof Error ? error.message : 'Inventory failed');
  process.exitCode = 1;
});
