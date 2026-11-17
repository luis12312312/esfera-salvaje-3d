const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'dist');
const files = [
  ['Esfera Salvaje 3D.html', 'index.html'],
  ['forest.css', 'forest.css'],
  ['forest-graphics.js', 'forest-graphics.js'],
  ['forest-atmosphere.js', 'forest-atmosphere.js'],
  ['forest-scenery.js', 'forest-scenery.js'],
  ['vendor/three.min.js', 'vendor/three.min.js'],
  ['vendor/THREE-LICENSE.txt', 'vendor/THREE-LICENSE.txt']
];
// Validate scripts and local references before replacing a previous build.
const html = fs.readFileSync(path.join(root, files[0][0]), 'utf8');
for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(code, {filename: files[0][0]});
for (const [source] of files) {
  const file = path.join(root, source);
  if (!fs.statSync(file).isFile()) throw Error('Missing asset: ' + source);
  if (source.endsWith('.js')) new vm.Script(fs.readFileSync(file, 'utf8'), {filename: source});
}
for (const [, asset] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (asset.startsWith('data:') || asset.startsWith('#')) continue;
  if (!files.some(([source]) => source === asset)) throw Error('Unexpected asset reference: ' + asset);
}
// The only directory this build may clear is the project's own dist directory.
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw Error('Invalid build directory');
fs.rmSync(output, {recursive: true, force: true});
for (const [source, target] of files) {
  const dest = path.join(output, target);
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.copyFileSync(path.join(root, source), dest);
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log('Build ready: dist/index.html (' + files.length + ' files, all resources local)');
