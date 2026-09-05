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

async function copyFirstAvailable(sources, dest) {
  for (const src of sources) {
    if (await copyIfExists(src, dest)) return true;
  }

  return false;
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await cp(path.join(root, 'assets'), path.join(outDir, 'assets'), { recursive: true });
await cp(path.join(root, 'css'), path.join(outDir, 'css'), { recursive: true });
await cp(path.join(root, 'js'), path.join(outDir, 'js'), { recursive: true });

await copyIfExists(path.join(root, 'privacy.html'), path.join(outDir, 'privacy.html'));
await copyIfExists(path.join(root, 'support.html'), path.join(outDir, 'support.html'));

const phaserCopied = await copyFirstAvailable(
  [
    path.join(root, 'vendor', 'phaser.min.js'),
    path.join(root, 'node_modules', 'phaser', 'dist', 'phaser.min.js')
  ],
  path.join(outDir, 'vendor', 'phaser.min.js')
);
const peerCopied = await copyFirstAvailable(
  [
    path.join(root, 'vendor', 'peerjs.min.js'),
    path.join(root, 'node_modules', 'peerjs', 'dist', 'peerjs.min.js')
  ],
  path.join(outDir, 'vendor', 'peerjs.min.js')
);

if (!phaserCopied) {
  throw new Error('Missing Phaser vendor file. Run npm install or add vendor/phaser.min.js.');
}

if (!peerCopied) {
  throw new Error('Missing PeerJS vendor file. Run npm install or add vendor/peerjs.min.js.');
}

const index = await readFile(path.join(root, 'index.html'), 'utf8');
await writeFile(path.join(outDir, 'index.html'), index);

console.log(`Built Capacitor web assets in ${path.relative(root, outDir)}/`);
console.log('Bundled Phaser locally.');
console.log('Bundled PeerJS locally.');
