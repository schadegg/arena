import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'www');

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(src, dest) {
  if (!(await exists(src))) return false;
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
  return true;
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await cp(path.join(root, 'assets'), path.join(outDir, 'assets'), { recursive: true });
await cp(path.join(root, 'css'), path.join(outDir, 'css'), { recursive: true });
await cp(path.join(root, 'js'), path.join(outDir, 'js'), { recursive: true });

let index = await readFile(path.join(root, 'index.html'), 'utf8');

const phaserCopied = await copyIfExists(
  path.join(root, 'node_modules', 'phaser', 'dist', 'phaser.min.js'),
  path.join(outDir, 'vendor', 'phaser.min.js')
);
const peerCopied = await copyIfExists(
  path.join(root, 'node_modules', 'peerjs', 'dist', 'peerjs.min.js'),
  path.join(outDir, 'vendor', 'peerjs.min.js')
);

if (phaserCopied) {
  index = index.replace(
    'https://cdn.jsdelivr.net/npm/phaser@3.70.0/dist/phaser.min.js',
    'vendor/phaser.min.js'
  );
}

if (peerCopied) {
  index = index.replace(
    'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
    'vendor/peerjs.min.js'
  );
}

await writeFile(path.join(outDir, 'index.html'), index);

console.log(`Built Capacitor web assets in ${path.relative(root, outDir)}/`);
console.log(phaserCopied ? 'Bundled Phaser locally.' : 'Phaser dependency not installed; leaving CDN URL.');
console.log(peerCopied ? 'Bundled PeerJS locally.' : 'PeerJS dependency not installed; leaving CDN URL.');
