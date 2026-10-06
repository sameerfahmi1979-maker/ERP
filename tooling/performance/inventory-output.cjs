'use strict';
const fs = process.getBuiltinModule('fs');
const path = process.getBuiltinModule('path');
const inventoryFiles = Object.freeze(['ADOPTION_REGISTER.json', 'READ_DEPENDENCY_GRAPH.json', 'SOURCE_MANIFEST.json', 'ADOPTION.md']);

// Only for a trusted, quiescent, explicitly admitted output directory. These
// checks reject pre-existing aliases; they are not a hostile-race/atomicity API.
function statIfPresent(name) {
  try { return fs.lstatSync(name); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function inspectDirectories(directory) {
  const root = path.parse(directory).root;
  let current = root;
  const parts = path.relative(root, directory).split(path.sep).filter(Boolean);
  for (const part of ['', ...parts]) {
    if (part) current = path.join(current, part);
    const stat = statIfPresent(current);
    if (!stat) return; // All existing parents have already passed.
    if (stat.isSymbolicLink() || !stat.isDirectory() || path.relative(current, fs.realpathSync(current)) !== '') {
      throw Error('Inventory directory must be ordinary and canonical: ' + current);
    }
  }
}
function inspectFile(name) {
  const stat = statIfPresent(name);
  if (stat && (stat.isSymbolicLink() || !stat.isFile() || !Number.isSafeInteger(stat.nlink) || stat.nlink !== 1 || path.relative(name, fs.realpathSync(name)) !== '')) {
    throw Error('Inventory artifact must be an ordinary single-link file: ' + name);
  }
  return stat;
}
function descendant(root, ...parts) {
  const target = path.join(root, ...parts);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('Inventory path escaped output');
  return target;
}
function inspectInventoryOutput(out, snapshotName) {
  if (typeof out !== 'string' || !path.isAbsolute(out)) throw Error('Absolute inventory output required');
  if (snapshotName !== undefined && (typeof snapshotName !== 'string' || !/^\d{17}$/.test(snapshotName))) throw Error('Invalid inventory snapshot name');
  out = path.resolve(out);
  inspectDirectories(out);
  const history = descendant(out, 'history');
  inspectDirectories(history);
  const paths = Object.fromEntries(inventoryFiles.map(file => [file, descendant(out, file)]));
  for (const name of Object.values(paths)) inspectFile(name);
  if (snapshotName !== undefined) {
    const snapshot = descendant(out, 'history', snapshotName);
    inspectDirectories(snapshot);
    for (const file of inventoryFiles) inspectFile(descendant(snapshot, file));
  }
  return paths;
}
function writeInventoryOutput(out, snapshotName, contents) {
  if (!contents || typeof contents !== 'object' || Array.isArray(contents)) throw Error('Four serialized inventory artifacts required');
  const keys = Reflect.ownKeys(contents);
  if (keys.length !== inventoryFiles.length || keys.some(key => !inventoryFiles.includes(key)) || inventoryFiles.some(file => typeof contents[file] !== 'string')) throw Error('Four serialized inventory artifacts required');
  const paths = inspectInventoryOutput(out, snapshotName);
  if (snapshotName === undefined) throw Error('Inventory snapshot name required');
  fs.mkdirSync(out, {recursive: true});
  fs.mkdirSync(path.join(out, 'history'), {recursive: true});
  inspectInventoryOutput(out, snapshotName);
  const snapshot = path.join(out, 'history', snapshotName);
  fs.mkdirSync(snapshot); // Exclusive: never merge/overwrite an earlier snapshot.
  inspectInventoryOutput(out, snapshotName);
  for (const file of inventoryFiles) {
    if (inspectFile(paths[file])) fs.copyFileSync(paths[file], path.join(snapshot, file), fs.constants.COPYFILE_EXCL);
  }
  // Every backup must finish before replacing any current artifact.
  inspectInventoryOutput(out, snapshotName);
  for (const file of inventoryFiles) fs.writeFileSync(paths[file], contents[file]);
}
module.exports = {inventoryFiles, inspectInventoryOutput, writeInventoryOutput};
